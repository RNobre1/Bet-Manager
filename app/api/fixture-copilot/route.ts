import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FIXTURE_TOOLS,
  executeFixtureTool,
  summarizeFixtureToolResult,
  type FixtureToolCtx,
} from "@/lib/fixtures/fixture-copilot-tools";
import { recordLlmRequest } from "@/lib/llm-logs";

const SYSTEM_PROMPT = `Você é um copiloto de apostas analisando UM jogo específico de futebol.
Você SÓ pode afirmar números que vieram de uma das ferramentas — nunca invente
estatística, jogador, árbitro ou odd. Use as ferramentas para puxar a camada
tratada (insights, splits, radar, recent matches, etc.) e responda em português
do Brasil, em markdown, citando o valor e a leitura para aposta. Se uma
ferramenta retornar {error}, diga o que faltou e siga com o que tem.`;

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const bodySchema = z
  .object({
    fixture_id: z.number().int().positive(),
    messages: z.array(chatMessageSchema).min(1),
    reasoner: z.boolean().optional(),
  })
  .refine((b) => b.messages[b.messages.length - 1].role === "user", {
    message: "messages must end with role=user",
    path: ["messages"],
  });

const MAX_TOOL_HOPS = 6;
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const REASONER_MODEL = "deepseek/deepseek-r1";
const REASONER_MAX_TOKENS = 16000;

interface UpstreamMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}
interface UpstreamUsage { prompt_tokens: number; completion_tokens: number; total_tokens?: number }
interface UpstreamChoice { message: { role: "assistant"; content: string | null; reasoning?: string; tool_calls?: UpstreamMessage["tool_calls"] } }
interface UpstreamResponse { choices: UpstreamChoice[]; usage?: UpstreamUsage }
interface Hop { tool: string; args: unknown; result_summary: string; took_ms: number }
interface CopilotMeta {
  model: string; latency_ms: number; hops: Hop[];
  usage_total: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  reasoning?: string;
}

export async function POST(request: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch (err) {
    return Response.json({ error: "invalid request body", details: String(err) }, { status: 400 });
  }
  if (!env.OPENROUTER_API_KEY) {
    return Response.json({ error: "OPENROUTER_API_KEY is not configured" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: row, error: rowErr } = await (admin as unknown as {
    from: (t: string) => {
      select: (c: string) => { eq: (k: string, v: number) => { maybeSingle: () => Promise<{ data: { id: number; home_team: string; away_team: string; detail_json: unknown } | null; error: unknown }> } };
    };
  })
    .from("fixtures")
    .select("id, home_team, away_team, detail_json")
    .eq("id", parsed.fixture_id)
    .maybeSingle();

  if (rowErr || !row) {
    return Response.json({ error: "fixture not found" }, { status: 404 });
  }
  if (!row.detail_json) {
    return Response.json(
      { error: "fixture has no detail yet", hint: "POST /api/fixtures/{id}/refresh first" },
      { status: 400 },
    );
  }

  const ctx: FixtureToolCtx = {
    detail: row.detail_json,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
  };

  const messages: UpstreamMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: `Jogo: ${row.home_team} (mandante) x ${row.away_team} (visitante).` },
    ...parsed.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const startedAt = Date.now();
  const hops: Hop[] = [];
  const usageTotal = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const useReasoner = parsed.reasoner === true;
  const model = useReasoner ? REASONER_MODEL : env.OPENROUTER_MODEL;
  let reasoning: string | undefined;

  function meta(): CopilotMeta {
    return { model, latency_ms: Date.now() - startedAt, hops, usage_total: usageTotal, ...(reasoning ? { reasoning } : {}) };
  }
  function accumulateUsage(u: UpstreamUsage | undefined): void {
    if (!u) return;
    usageTotal.prompt_tokens += u.prompt_tokens;
    usageTotal.completion_tokens += u.completion_tokens;
    usageTotal.total_tokens += u.total_tokens ?? u.prompt_tokens + u.completion_tokens;
  }

  try {
    for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
      const upstream = await callOpenRouter(messages, env.OPENROUTER_API_KEY, model, useReasoner ? REASONER_MAX_TOKENS : undefined);
      accumulateUsage(upstream.usage);
      const msg = upstream.choices[0].message;
      if (msg.reasoning) reasoning = msg.reasoning;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const finalMeta = meta();
        await recordLlmRequest(admin, {
          route: "fixture-copilot", fixture_id: parsed.fixture_id, model, cached: false,
          reasoner: useReasoner, latency_ms: finalMeta.latency_ms,
          prompt_tokens: finalMeta.usage_total.prompt_tokens,
          completion_tokens: finalMeta.usage_total.completion_tokens,
          total_tokens: finalMeta.usage_total.total_tokens, hops: finalMeta.hops,
        });
        return Response.json({ content: msg.content ?? "", meta: finalMeta });
      }

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        const hopStarted = Date.now();
        let args: unknown = {};
        try { args = JSON.parse(call.function.arguments); } catch { args = { _raw: call.function.arguments }; }
        const result = await executeFixtureTool(call.function.name, args, ctx);
        hops.push({
          tool: call.function.name, args,
          result_summary: summarizeFixtureToolResult(call.function.name, result),
          took_ms: Date.now() - hopStarted,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    const cappedMeta = meta();
    await recordLlmRequest(admin, {
      route: "fixture-copilot", fixture_id: parsed.fixture_id, model, cached: false,
      reasoner: useReasoner, latency_ms: cappedMeta.latency_ms,
      prompt_tokens: cappedMeta.usage_total.prompt_tokens,
      completion_tokens: cappedMeta.usage_total.completion_tokens,
      total_tokens: cappedMeta.usage_total.total_tokens, hops: cappedMeta.hops,
      error: "max_tool_hops reached",
    });
    return Response.json({
      content: "Não consegui concluir em até 6 consultas. Tente uma pergunta mais direta.",
      meta: cappedMeta,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await recordLlmRequest(admin, {
      route: "fixture-copilot", fixture_id: parsed.fixture_id, model, cached: false,
      reasoner: useReasoner, latency_ms: Date.now() - startedAt,
      prompt_tokens: usageTotal.prompt_tokens, completion_tokens: usageTotal.completion_tokens,
      total_tokens: usageTotal.total_tokens, hops, error: message,
    });
    return Response.json({ error: "upstream copilot error", details: message }, { status: 502 });
  }
}

async function callOpenRouter(
  messages: UpstreamMessage[], apiKey: string, model: string, maxTokens?: number,
): Promise<UpstreamResponse> {
  const body: Record<string, unknown> = {
    model, messages, tools: FIXTURE_TOOLS, tool_choice: "auto",
  };
  if (maxTokens) body.max_tokens = maxTokens;
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://abissal.rnobre.dev",
      "X-Title": "Abissal Fixture Copilot",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json() as Promise<UpstreamResponse>;
}
