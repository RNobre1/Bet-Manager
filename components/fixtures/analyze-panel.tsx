"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FixtureDTO } from "@/lib/fixtures/types";
import { ChatMessageView, type ChatMessage } from "./chat-message";

interface AnalyzePanelProps {
  fixture: FixtureDTO;
}

type Status =
  | "idle"
  | "refreshing-detail"
  | "streaming"
  | "ready"
  | "error"
  | "aborted";

/**
 * Client-side LLM streaming UI for a single fixture. On mount, POSTs to
 * `/api/analyze` (no `question`) and consumes the SSE stream chunk-by-chunk.
 * Subsequent follow-up turns reuse the same endpoint with `{ fixture_id,
 * question }`. When the fixture has no detail_json cached, the user is
 * presented with a "buscar detalhe" button that POSTs to
 * `/api/fixtures/[id]/refresh` and then triggers `router.refresh()` to
 * re-fetch the page (so `has_detail` flips to true), and the analysis can
 * start.
 *
 * SSE wire format (matches app/api/analyze/route.ts):
 *   - chunk:  `data: {"delta": "..."}`
 *   - end:    `event: done\ndata: {}`
 *   - error:  `event: error\ndata: {"message": "..."}`
 *
 * No external dep — vanilla `fetch` + `ReadableStream` reader.
 */
const INITIAL_ASK_MARKER =
  "Faça a análise pré-jogo desse confronto a partir dos dados fornecidos.";

interface MetaInfo {
  model?: string;
  cached?: boolean;
  system_prompt_chars?: number;
  latency_ms?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens?: number;
  };
}

const LOADING_PHASES = [
  "Lendo o detalhe do confronto…",
  "Cruzando estatísticas da liga…",
  "Analisando os últimos resultados de cada lado…",
  "Olhando tendências — over, BTTS, escanteios, cartões…",
  "Avaliando forma recente e momentum…",
  "Pesando o histórico do confronto direto…",
  "Tirando conclusões…",
] as const;

export function AnalyzePanel({ fixture }: AnalyzePanelProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // `pending` is the partial assistant content the SSE stream has accumulated
  // so far. It's wired through to the UI in desktop mode (where there's
  // screen real estate to watch the model think) and intentionally suppressed
  // on mobile (where the AnalysisLoader runs instead).
  const [pending, setPending] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [loaderPhase, setLoaderPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Operational metadata indexed by the assistant message position it
  // describes — populated by `event: meta` SSE frames. Surfaced inside the
  // dev log <details> under the matching assistant turn.
  const [messagesMeta, setMessagesMeta] = useState<Record<number, MetaInfo>>({});
  // Per-user dev toggle persisted to localStorage. When on, the live stream is
  // shown during analysis (instead of the loader), and a collapsible <details>
  // exposing the raw assembled markdown is appended under each assistant turn.
  // Default off so end-users get the polished UX; flip it on for debugging.
  const [showLog, setShowLog] = useState(false);
  // Opt-in: use deepseek/deepseek-r1 (reasoning model) instead of v3.2. Slower
  // and pricier but emits genuine chain-of-thought tokens that surface under
  // the assistant turn when the log toggle is also on.
  const [useReasoner, setUseReasoner] = useState(false);
  // Accumulated reasoning text from the in-flight turn (R1 only).
  const [pendingReasoning, setPendingReasoning] = useState("");
  // Final reasoning indexed per assistant message (same scheme as messagesMeta).
  const [messagesReasoning, setMessagesReasoning] = useState<
    Record<number, string>
  >({});
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const log = window.localStorage.getItem("abissal:dev-log") === "1";
      const reasoner =
        window.localStorage.getItem("abissal:dev-reasoner") === "1";
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowLog(log);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUseReasoner(reasoner);
    } catch {
      // Safari private mode / SSR — keep default (off).
    }
  }, []);

  function toggleReasoner() {
    setUseReasoner((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(
          "abissal:dev-reasoner",
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleLog() {
    setShowLog((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("abissal:dev-log", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // ESC → back to /fixtures.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        router.push("/fixtures");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  // Rotate the loader phrase while the upstream LLM is still working.
  // We don't expose token-by-token output to the user (it's distracting and
  // the model can change its mind mid-stream); instead, the SSE accumulator
  // collects everything quietly and the final message is rendered in one go
  // when `event: done` arrives.
  useEffect(() => {
    if (status !== "streaming") return;
    // Reset is intentional — at the start of every analysis we want phase 0,
    // not whatever was on screen from the previous run.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaderPhase(0);
    const interval = setInterval(() => {
      setLoaderPhase((p) => (p + 1) % LOADING_PHASES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, [status]);

  const streamAnalysis = useCallback(
    async (question?: string, history?: ChatMessage[]) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");
      setError(null);
      setPending("");
      setPendingReasoning("");

      let assembled = "";
      let reasoningBuf = "";
      let turnMeta: MetaInfo | null = null;
      try {
        // Follow-up turns ship the full conversation history so the backend
        // doesn't re-prompt the entire analysis from scratch. The initial
        // turn keeps the legacy shape so its cache entry stays addressable.
        const body =
          question && history
            ? {
                fixture_id: fixture.id,
                reasoner: useReasoner,
                messages: [
                  ...history.map((m) => ({ role: m.role, content: m.content })),
                  { role: "user" as const, content: question },
                ],
              }
            : { fixture_id: fixture.id, reasoner: useReasoner };
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const message = await safeReadError(res);
          setError(message ?? `HTTP ${res.status}`);
          setStatus("error");
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        readLoop: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const evt = parseEvent(raw);
            if (evt.event === "done") {
              break readLoop;
            }
            if (evt.event === "error") {
              const msg =
                typeof evt.data?.message === "string"
                  ? evt.data.message
                  : "stream error";
              setError(msg);
              setStatus("error");
              return;
            }
            if (evt.event === "meta" && evt.data) {
              turnMeta = evt.data as MetaInfo;
              continue;
            }
            if (evt.event === "reasoning" && evt.data) {
              const r = evt.data.reasoning;
              if (typeof r === "string") {
                reasoningBuf += r;
                setPendingReasoning(reasoningBuf);
              }
              continue;
            }
            // Default event: delta chunk. Accumulate into `assembled`
            // (commits to messages at the end) and mirror to `pending` so
            // the desktop watcher renders the live stream.
            const deltaCandidate = evt.data?.delta;
            if (typeof deltaCandidate === "string") {
              assembled += deltaCandidate;
              setPending(assembled);
            }
          }
        }

        setPending("");
        setMessages((prev) => {
          // Bootstrap the conversation on the initial turn so follow-ups can
          // present a normal [user, assistant, user, ...] sequence to the LLM
          // — the hidden marker stays in state but never renders.
          const isInitial = !question && prev.length === 0;
          const next = isInitial
            ? ([
                { role: "user", content: INITIAL_ASK_MARKER, hidden: true },
                { role: "assistant", content: assembled },
              ] as ChatMessage[])
            : [...prev, { role: "assistant", content: assembled } as ChatMessage];
          const assistantIdx = next.length - 1;
          if (turnMeta) {
            setMessagesMeta((m) => ({ ...m, [assistantIdx]: turnMeta! }));
          }
          if (reasoningBuf.length > 0) {
            setMessagesReasoning((m) => ({
              ...m,
              [assistantIdx]: reasoningBuf,
            }));
          }
          return next;
        });
        setPendingReasoning("");
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) {
          setStatus("aborted");
          return;
        }
        setError(err instanceof Error ? err.message : "unknown error");
        setStatus("error");
      }
    },
    [fixture.id, useReasoner],
  );

  // Auto-kick the initial analysis when detail is available. We do call
  // setState() from inside streamAnalysis(), but it's gated behind a fetch
  // — the effect is genuinely synchronizing with an external system (the
  // SSE stream), not cascading renders, so the lint rule is suppressed.
  useEffect(() => {
    if (startedRef.current) return;
    if (!fixture.has_detail) return;
    startedRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void streamAnalysis();
    return () => {
      abortRef.current?.abort();
    };
  }, [fixture.has_detail, streamAnalysis]);

  async function onRefreshDetail() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/fixtures/${fixture.id}/refresh`, {
        method: "POST",
      });
      if (!res.ok) {
        const msg = await safeReadError(res);
        setError(msg ?? `HTTP ${res.status}`);
        return;
      }
      // Re-render the server page so `fixture.has_detail` flips to true and
      // the analysis auto-starts.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || status === "streaming") return;
    setInput("");
    // Snapshot history BEFORE the optimistic user turn — streamAnalysis
    // appends the new question itself when building the request body.
    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    await streamAnalysis(q, history);
    inputRef.current?.focus();
  }

  function onCancel() {
    abortRef.current?.abort();
  }

  function onRetry() {
    setError(null);
    void streamAnalysis();
  }

  // ─── Render branches ──────────────────────────────────────────────────

  if (!fixture.has_detail) {
    return (
      <section
        className="card flex flex-col items-start gap-4 p-8"
        aria-labelledby="refresh-cta"
      >
        <span
          id="refresh-cta"
          className="font-[var(--font-display)] text-xl italic"
          style={{ color: "var(--color-ink-muted)" }}
        >
          sem detalhe em cache.
        </span>
        <p className="max-w-prose text-sm text-[var(--color-ink-muted)]">
          Este jogo está fora da whitelist do scraper diário. Clique abaixo
          para buscar os dados (recent matches, H2H, streaks) sob demanda
          (~3s) antes de iniciar a análise.
        </p>
        {error ? (
          <p className="text-sm" style={{ color: "var(--color-vermelho)" }}>
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onRefreshDetail}
          disabled={refreshing}
          className="rounded-[var(--radius-sm)] bg-[var(--color-vermelho)] px-4 py-2 text-xs font-medium uppercase tracking-[0.18em] text-[var(--color-ink-display)] transition-colors hover:bg-[var(--color-vermelho-hi)] disabled:opacity-50"
        >
          {refreshing ? "buscando…" : "buscar detalhe"}
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6" aria-label="Análise pré-jogo">
      <div className="flex items-center justify-end gap-2">
        <ToggleChip
          on={useReasoner}
          onClick={toggleReasoner}
          label="reasoner"
          title="Usar DeepSeek R1 (~2x mais caro/lento, com raciocínio visível)"
        />
        <ToggleChip
          on={showLog}
          onClick={toggleLog}
          label="log"
          title="Mostrar log de stream / fonte raw / metadados (debug)"
        />
      </div>

      <div className="flex flex-col gap-5" aria-live="polite">
        {messages.map((m, i) =>
          m.hidden ? null : (
            <div key={i} className="flex flex-col gap-2">
              {messagesReasoning[i] ? (
                <ReasoningDetails content={messagesReasoning[i]} />
              ) : null}
              <ChatMessageView message={m} />
              {showLog && m.role === "assistant" ? (
                <RawLogDetails
                  content={m.content}
                  meta={messagesMeta[i] ?? null}
                />
              ) : null}
            </div>
          ),
        )}

        {status === "streaming" && useReasoner && pendingReasoning ? (
          <ReasoningDetails content={pendingReasoning} pending />
        ) : null}

        {status === "streaming" ? (
          showLog ? (
            // Log mode: live token stream visible everywhere (mobile + desktop).
            // Falls back to the loader for the first ~second before chunks
            // arrive so the screen never sits empty.
            pending ? (
              <ChatMessageView
                message={{ role: "assistant", content: pending }}
              />
            ) : (
              <AnalysisLoader phase={loaderPhase} />
            )
          ) : (
            <AnalysisLoader phase={loaderPhase} />
          )
        ) : null}
      </div>

      {status === "error" ? (
        <div
          role="alert"
          className="card flex items-center justify-between gap-4 p-4"
          style={{ borderColor: "var(--color-vermelho-low)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-vermelho)" }}>
            {error ?? "erro desconhecido"}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="label hover:text-[var(--color-ink)]"
          >
            tentar novamente
          </button>
        </div>
      ) : null}

      {status === "aborted" ? (
        <div role="status" className="card flex items-center justify-between gap-4 p-4">
          <p className="text-sm text-[var(--color-ink-muted)]">Análise cancelada.</p>
          <button
            type="button"
            onClick={onRetry}
            className="label hover:text-[var(--color-ink)]"
          >
            retomar
          </button>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="flex items-center gap-2 border-t border-[var(--color-line-subtle)] pt-4"
      >
        <label htmlFor="analyze-input" className="sr-only">
          Pergunta de follow-up
        </label>
        <input
          ref={inputRef}
          id="analyze-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status === "streaming"}
          placeholder="Pergunte algo sobre este jogo…"
          className="flex-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:border-[var(--color-line-strong)] focus:outline-none disabled:opacity-50"
        />
        {status === "streaming" ? (
          <button
            type="button"
            onClick={onCancel}
            className="label rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-3 py-2 hover:text-[var(--color-ink)]"
          >
            cancelar
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="label rounded-[var(--radius-sm)] bg-[var(--color-vermelho)] px-3 py-2 text-[var(--color-ink-display)] hover:bg-[var(--color-vermelho-hi)] disabled:opacity-50"
          >
            enviar
          </button>
        )}
      </form>
    </section>
  );
}

// ─── Loader ─────────────────────────────────────────────────────────────

function AnalysisLoader({ phase }: { phase: number }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-6 px-6 py-14 text-center">
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-2.5 w-2.5 rounded-full bg-[var(--color-vermelho)] motion-safe:animate-bounce"
            style={{ animationDelay: `${i * 140}ms` }}
          />
        ))}
      </div>

      <p
        key={phase}
        className="text-sm italic text-[var(--color-ink-muted)] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-700"
        aria-live="polite"
      >
        {LOADING_PHASES[phase]}
      </p>

      <span className="label text-[var(--color-ink-faint)]">
        processando análise
      </span>
    </div>
  );
}

function ToggleChip({
  on,
  onClick,
  label,
  title,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={title}
      className="label inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line-subtle)] px-2.5 py-1 text-[var(--color-ink-faint)] hover:border-[var(--color-line)] hover:text-[var(--color-ink)]"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          backgroundColor: on
            ? "var(--color-vermelho)"
            : "var(--color-ink-faint)",
        }}
      />
      {label}
    </button>
  );
}

function ReasoningDetails({
  content,
  pending,
}: {
  content: string;
  pending?: boolean;
}) {
  return (
    <details
      className="rounded-[var(--radius-sm)] border border-dashed border-[var(--color-line-subtle)] bg-[var(--color-surface-2)]"
      open={pending}
    >
      <summary className="label cursor-pointer select-none px-3 py-2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
        {pending
          ? `raciocínio (gerando…) — ${content.length} chars`
          : `raciocínio — ${content.length} chars`}
      </summary>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 pb-3 font-mono text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
        {content}
      </pre>
    </details>
  );
}

function RawLogDetails({
  content,
  meta,
}: {
  content: string;
  meta: MetaInfo | null;
}) {
  return (
    <details className="rounded-[var(--radius-sm)] border border-[var(--color-line-subtle)] bg-[var(--color-surface-2)]">
      <summary className="label cursor-pointer select-none px-3 py-2 text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]">
        ver log do turno
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        {meta ? <MetaPanel meta={meta} /> : null}
        <div className="flex flex-col gap-1">
          <span className="label text-[var(--color-ink-faint)]">
            fonte raw ({content.length} chars)
          </span>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
            {content}
          </pre>
        </div>
      </div>
    </details>
  );
}

function MetaPanel({ meta }: { meta: MetaInfo }) {
  const rows: Array<[string, string]> = [];
  if (meta.model) rows.push(["modelo", meta.model]);
  if (meta.cached) rows.push(["origem", "cache (hit)"]);
  if (typeof meta.latency_ms === "number") {
    rows.push(["latência", `${meta.latency_ms} ms`]);
  }
  if (typeof meta.system_prompt_chars === "number") {
    rows.push(["system prompt", `${meta.system_prompt_chars} chars`]);
  }
  if (meta.usage) {
    rows.push(["tokens in", String(meta.usage.prompt_tokens)]);
    rows.push(["tokens out", String(meta.usage.completion_tokens)]);
    if (meta.usage.total_tokens != null) {
      rows.push(["tokens total", String(meta.usage.total_tokens)]);
    }
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] leading-relaxed">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-[var(--color-ink-faint)]">{k}</dt>
          <dd className="text-[var(--color-ink-muted)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ─── SSE helpers ────────────────────────────────────────────────────────

interface SSEEvent {
  event: string;
  data: Record<string, unknown> | null;
}

function parseEvent(raw: string): SSEEvent {
  let eventName = "message";
  let dataLine = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLine += line.slice(5).trimStart();
    }
  }
  if (!dataLine) return { event: eventName, data: null };
  try {
    return { event: eventName, data: JSON.parse(dataLine) as Record<string, unknown> };
  } catch {
    return { event: eventName, data: null };
  }
}

async function safeReadError(res: Response): Promise<string | null> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? null;
  } catch {
    return null;
  }
}
