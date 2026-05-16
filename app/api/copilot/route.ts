import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  QUERY_FIXTURES_TOOL,
  queryFixtures,
  type QueryFixturesArgs,
} from "@/lib/fixtures/copilot-tools";
import {
  SCAN_FIXTURES_TOOL,
  INSPECT_FIXTURE_TOOL,
  scanFixtures,
  scanResultSummary,
  inspectFixture,
  type ScanFixturesArgs,
  type InspectFixtureArgs,
} from "@/lib/fixtures/copilot-scan-tools";
import { summarizeFixtureToolResult } from "@/lib/fixtures/fixture-copilot-tools";
import { recordLlmRequest } from "@/lib/llm-logs";

export const maxDuration = 60;

/**
 * POST /api/copilot — fixtures-day chat backed by tool calls.
 *
 * Body: { messages: [{role,content},...], date?: string }
 *
 * Flow:
 *   1. Build a system prompt that primes the agent + describes all 3 tools.
 *   2. POST to OpenRouter with `tools: [query_fixtures, scan_fixtures, inspect_fixture]`.
 *   3. If the response carries `tool_calls`, execute them against Postgres
 *      and re-post with the result as a `role:"tool"` message.
 *   4. Loop bounded at MAX_TOOL_HOPS (4) so a misbehaving model can't burn the
 *      budget; the final non-tool-call content is returned as JSON.
 *
 * Non-streaming on purpose: tool dances are awkward to stream and the
 * round-trip is typically 1–3 seconds. The UI shows a loader meanwhile.
 */

const SYSTEM_PROMPT = `Você é um copiloto de apostas pré-jogo focado nos jogos de futebol do dia.

Ferramentas (use sempre dados frescos — nunca invente jogos/números):
- query_fixtures: lista compacta dos jogos do dia (badges, árbitro).
- scan_fixtures: TRIAGEM rasa cross-jogo — varre o dia com sinais derivados, filtra/ordena/projeta server-side. Use para "quais jogos…", rankings e comparações amplas.
- inspect_fixture: MERGULHO profundo — roda uma das 12 derivações do dashboard sobre UM jogo. Use só nos jogos do shortlist do scan, para a análise de alta qualidade.

Disciplina (2 etapas):
1. Para qualquer pergunta cross-jogo, comece por query_fixtures/scan_fixtures (triagem). Nunca pule direto pro inspect sem ter o id de um jogo.
2. Só então chame inspect_fixture nos top-N do shortlist (várias vezes se preciso) antes de concluir.
- Regra sempre válida: toda afirmação numérica cita o valor exato vindo de uma tool + a leitura; nada fora do detail_json.

Convenções de resposta:
- Português do Brasil, em markdown, seções curtas.
- Comece dizendo quantos jogos casaram ("Achei 3 jogos…").
- Liste como "HH:MM BRT • Time A vs Time B (Liga, País)".
- Se nada casar o filtro, diga isso explicitamente.`;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const bodySchema = z
  .object({
    messages: z.array(chatMessageSchema).min(1),
    date: z.string().optional(),
    reasoner: z.boolean().optional(),
  })
  .refine((b) => b.messages[b.messages.length - 1].role === "user", {
    message: "messages must end with role=user",
    path: ["messages"],
  });

const MAX_TOOL_HOPS = 4;
const REASONER_MAX_TOOL_HOPS = 3;
const OPENROUTER_CALL_TIMEOUT_MS = 25_000;
const REQUEST_DEADLINE_MS = 45_000;
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REASONER_MODEL = "deepseek/deepseek-r1";
const REASONER_MAX_TOKENS = 16000;

interface UpstreamMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

interface UpstreamUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}

interface UpstreamChoice {
  message: {
    role: "assistant";
    content: string | null;
    reasoning?: string;
    tool_calls?: UpstreamMessage["tool_calls"];
  };
}

interface UpstreamResponse {
  choices: UpstreamChoice[];
  usage?: UpstreamUsage;
}

interface Hop {
  tool: string;
  args: unknown;
  result_summary: string;
  took_ms: number;
}

interface CopilotMeta {
  model: string;
  latency_ms: number;
  hops: Hop[];
  usage_total: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  reasoning?: string;
}

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    const raw = await request.json();
    parsed = bodySchema.parse(raw);
  } catch (err) {
    return Response.json(
      { error: "invalid request body", details: String(err) },
      { status: 400 },
    );
  }

  if (!env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured" },
      { status: 503 },
    );
  }

  const admin = createAdminClient();
  const messages: UpstreamMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...parsed.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // If the client suggested a date (the page's selected ?date), inline it as
  // a system hint so the model is anchored without needing to call the tool
  // just to discover "today".
  if (parsed.date) {
    messages.splice(1, 0, {
      role: "system",
      content: `Data selecionada na UI: ${parsed.date}. Use essa data como default para query_fixtures se o usuário não disser outra.`,
    });
  }

  const startedAt = Date.now();
  const hops: Hop[] = [];
  const usageTotal = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const useReasoner = parsed.reasoner === true;
  const model = useReasoner ? REASONER_MODEL : env.OPENROUTER_MODEL;
  let reasoning: string | undefined;

  function meta(): CopilotMeta {
    return {
      model,
      latency_ms: Date.now() - startedAt,
      hops,
      usage_total: usageTotal,
      ...(reasoning ? { reasoning } : {}),
    };
  }

  function accumulateUsage(u: UpstreamUsage | undefined): void {
    if (!u) return;
    usageTotal.prompt_tokens += u.prompt_tokens;
    usageTotal.completion_tokens += u.completion_tokens;
    usageTotal.total_tokens +=
      u.total_tokens ?? u.prompt_tokens + u.completion_tokens;
  }

  const hopCap = useReasoner ? REASONER_MAX_TOOL_HOPS : MAX_TOOL_HOPS;
  let exitReason: "cap" | "deadline" = "cap";

  try {
    for (let hop = 0; hop < hopCap; hop++) {
      if (Date.now() - startedAt > REQUEST_DEADLINE_MS) {
        exitReason = "deadline";
        break;
      }
      const upstream = await callOpenRouter(
        messages,
        env.OPENROUTER_API_KEY,
        model,
        useReasoner ? REASONER_MAX_TOKENS : undefined,
        OPENROUTER_CALL_TIMEOUT_MS,
      );
      accumulateUsage(upstream.usage);
      const choice = upstream.choices[0];
      const msg = choice.message;
      if (msg.reasoning) reasoning = msg.reasoning;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const finalMeta = meta();
        await recordLlmRequest(admin, {
          route: "copilot",
          model,
          cached: false,
          reasoner: useReasoner,
          latency_ms: finalMeta.latency_ms,
          prompt_tokens: finalMeta.usage_total.prompt_tokens,
          completion_tokens: finalMeta.usage_total.completion_tokens,
          total_tokens: finalMeta.usage_total.total_tokens,
          hops: finalMeta.hops,
        });
        return Response.json({ content: msg.content ?? "", meta: finalMeta });
      }

      messages.push({
        role: "assistant",
        content: msg.content ?? null,
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        const hopStarted = Date.now();
        const result = await executeToolCall(call.function, admin);
        const parsedArgs = parseToolArgs(call.function.arguments);
        const subTool =
          call.function.name === "inspect_fixture"
            ? (parsedArgs as { tool?: string })?.tool
            : undefined;
        hops.push({
          tool: call.function.name,
          args: parsedArgs,
          result_summary: summarizeResult(call.function.name, result, subTool),
          took_ms: Date.now() - hopStarted,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Hit hopCap or deadline — Surface a safe message rather than burning more budget.
    const cappedMeta = meta();
    await recordLlmRequest(admin, {
      route: "copilot",
      model,
      cached: false,
      reasoner: useReasoner,
      latency_ms: cappedMeta.latency_ms,
      prompt_tokens: cappedMeta.usage_total.prompt_tokens,
      completion_tokens: cappedMeta.usage_total.completion_tokens,
      total_tokens: cappedMeta.usage_total.total_tokens,
      hops: cappedMeta.hops,
      error: exitReason === "deadline" ? "deadline_exceeded" : "max_tool_hops reached",
    });
    return Response.json({
      content:
        "Não consegui finalizar a resposta a tempo. Tente uma pergunta mais específica (menos jogos ou filtros).",
      meta: cappedMeta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await recordLlmRequest(admin, {
      route: "copilot",
      model,
      cached: false,
      reasoner: useReasoner,
      latency_ms: Date.now() - startedAt,
      prompt_tokens: usageTotal.prompt_tokens,
      completion_tokens: usageTotal.completion_tokens,
      total_tokens: usageTotal.total_tokens,
      hops,
      error: message,
    });
    return Response.json(
      { error: "upstream copilot error", details: message },
      { status: 502 },
    );
  }
}

async function callOpenRouter(
  messages: UpstreamMessage[],
  apiKey: string,
  model: string,
  maxTokens: number | undefined,
  timeoutMs: number,
): Promise<UpstreamResponse> {
  const reqBody: Record<string, unknown> = {
    model,
    messages,
    tools: [QUERY_FIXTURES_TOOL, SCAN_FIXTURES_TOOL, INSPECT_FIXTURE_TOOL],
    tool_choice: "auto",
  };
  if (maxTokens) reqBody.max_tokens = maxTokens;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://abissal.rnobre.dev",
        "X-Title": "Abissal Copilot",
      },
      body: JSON.stringify(reqBody),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 200)}`);
    }
    return res.json() as Promise<UpstreamResponse>;
  } finally {
    clearTimeout(timer);
  }
}

function parseToolArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { _raw: raw };
  }
}

function summarizeResult(name: string, result: unknown, subTool?: string): string {
  if (!result || typeof result !== "object") return String(result);
  if (name === "scan_fixtures") return scanResultSummary(result);
  if (name === "inspect_fixture") {
    const r = result as Record<string, unknown>;
    if (typeof r.error === "string") return `error: ${r.error}`;
    const effectiveName = subTool ?? name;
    return `inspect_fixture[${effectiveName}]: ${summarizeFixtureToolResult(effectiveName, result)}`;
  }
  const r = result as Record<string, unknown>;
  if (typeof r.error === "string") return `error: ${r.error}`;
  if (Array.isArray(r.fixtures)) {
    const n = r.fixtures.length;
    const total = typeof r.total === "number" ? r.total : n;
    const date = typeof r.date === "string" ? r.date : "?";
    return `${n} fixture(s) returned (total ${total}, date ${date})`;
  }
  return JSON.stringify(result).slice(0, 120);
}

async function executeToolCall(
  fn: { name: string; arguments: string },
  admin: ReturnType<typeof createAdminClient>,
): Promise<unknown> {
  let args: unknown;
  try {
    args = JSON.parse(fn.arguments);
  } catch {
    return { error: "invalid JSON arguments" };
  }
  const a = admin as unknown as { from: (t: string) => unknown };
  if (fn.name === "query_fixtures") return queryFixtures(args as QueryFixturesArgs, a);
  if (fn.name === "scan_fixtures") return scanFixtures(args as ScanFixturesArgs, a);
  if (fn.name === "inspect_fixture") return inspectFixture(args as InspectFixtureArgs, a);
  return { error: `unknown tool: ${fn.name}` };
}
