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
  const [status, setStatus] = useState<Status>("idle");
  const [loaderPhase, setLoaderPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    async (question?: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("streaming");
      setError(null);

      let assembled = "";
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(
            question
              ? { fixture_id: fixture.id, question }
              : { fixture_id: fixture.id },
          ),
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
            // Default event: delta chunk — accumulate quietly; the UI is
            // showing the loader instead of token-by-token output.
            const deltaCandidate = evt.data?.delta;
            if (typeof deltaCandidate === "string") {
              assembled += deltaCandidate;
            }
          }
        }

        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assembled },
        ]);
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
    [fixture.id],
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
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    await streamAnalysis(q);
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
      <div className="flex flex-col gap-5" aria-live="polite">
        {messages.map((m, i) => (
          <ChatMessageView key={i} message={m} />
        ))}

        {status === "streaming" ? <AnalysisLoader phase={loaderPhase} /> : null}
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
