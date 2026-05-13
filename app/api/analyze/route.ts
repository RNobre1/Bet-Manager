import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeContentHash,
  lookupByHash,
  storeAnalysis,
} from "@/lib/fixtures/analysis-cache";
import {
  buildSystemPrompt,
  DEFAULT_USER_PROMPT,
} from "@/lib/fixtures/prompt-builder";
import { streamChatCompletion, OpenRouterError } from "@/lib/openrouter";
import type { FixtureRow } from "@/lib/fixtures/types";

/**
 * POST /api/analyze — SSE-streamed pre-game LLM analysis.
 *
 * Body: { fixture_id: number, question?: string }.
 *   - When `question` is absent, generates the initial pre-game write-up.
 *   - When present, treated as a follow-up turn appended after the default
 *     analysis ask (separate cache entry — hash includes the question).
 *
 * Lifecycle:
 *   1. Validate body, load fixture row (404 if not found, 400 if missing
 *      detail_json so the client knows to call /api/fixtures/[id]/refresh).
 *   2. Compute sha256(model + fixture_id + question + detail_json).
 *   3. Cache hit → emit the cached content as a single SSE delta + done.
 *   4. Cache miss → proxy OpenRouter's SSE stream chunk-by-chunk,
 *      assembling the full content on the way through. On `done`, persist
 *      the content under the hash (ON CONFLICT DO NOTHING — concurrent calls OK).
 *
 * SSE format on the wire:
 *   - chunk:  `data: ${JSON.stringify({ delta: "..." })}\n\n`
 *   - end:    `event: done\ndata: {}\n\n`
 *   - error:  `event: error\ndata: ${JSON.stringify({ message: "..." })}\n\n`
 */

const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const bodySchema = z
  .object({
    fixture_id: z.number().int().positive(),
    question: z.string().optional(),
    messages: z.array(chatMessageSchema).optional(),
  })
  .refine(
    (b) =>
      b.messages === undefined ||
      (b.messages.length > 0 &&
        b.messages[b.messages.length - 1].role === "user"),
    {
      message: "messages must be non-empty and end with role=user",
      path: ["messages"],
    },
  );

export async function POST(request: Request): Promise<Response> {
  // ─── 1. Validate body ─────────────────────────────────────────────────
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
  const { fixture_id, question, messages } = parsed;
  const isFollowUp = messages !== undefined;

  // ─── 2. Env precondition ──────────────────────────────────────────────
  if (!env.OPENROUTER_API_KEY) {
    return Response.json(
      {
        error:
          "OPENROUTER_API_KEY is not configured — analysis route disabled.",
      },
      { status: 503 },
    );
  }

  // ─── 3. Load fixture ──────────────────────────────────────────────────
  // The generated `Database` type does not yet include the `fixtures` and
  // `analysis_cache` tables (migrations 0007+). Until types are regenerated,
  // we operate via an untyped view of the client for these tables.
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untypedSb = supabase as unknown as { from: (t: string) => any };
  const { data: fixture, error: fixtureErr } = await untypedSb
    .from("fixtures")
    .select(
      "id, match_date, ko_time, home_team, away_team, league, country, source_url, detail_json, kickoff_utc",
    )
    .eq("id", fixture_id)
    .maybeSingle();

  if (fixtureErr) {
    return Response.json(
      { error: `failed to load fixture: ${fixtureErr.message}` },
      { status: 500 },
    );
  }
  if (!fixture) {
    return Response.json({ error: "fixture not found" }, { status: 404 });
  }
  const fixtureRow = fixture as unknown as FixtureRow;
  if (!fixtureRow.detail_json) {
    return Response.json(
      {
        error:
          "fixture has no detail_json — call POST /api/fixtures/[id]/refresh first to scrape the detail page",
      },
      { status: 400 },
    );
  }

  // ─── 4. Compute hash + cache lookup (only for first-turn / legacy path) ─
  const model = env.OPENROUTER_MODEL;
  const systemPrompt = buildSystemPrompt(fixtureRow);

  if (isFollowUp) {
    // Multi-turn: feed the full history straight upstream. Cache is bypassed
    // — same question after different history yields different answers, so a
    // hash on the last user turn alone would be a footgun.
    const upstreamMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];
    return new Response(
      await buildLiveSseStreamFromMessages({
        messages: upstreamMessages,
        model,
        apiKey: env.OPENROUTER_API_KEY,
      }),
      { status: 200, headers: sseHeaders() },
    );
  }

  const hash = computeContentHash({
    model,
    fixtureId: fixture_id,
    question,
    detailJson: fixtureRow.detail_json,
  });
  const cached = await lookupByHash(hash, untypedSb);

  // ─── 5. Stream out ────────────────────────────────────────────────────
  if (cached) {
    return new Response(
      buildCachedSseStream(cached.content, {
        model,
        cached: true,
        system_prompt_chars: systemPrompt.length,
        latency_ms: 0,
      }),
      { status: 200, headers: sseHeaders() },
    );
  }

  // Cache miss → call OpenRouter and proxy upstream stream through.
  const userPrompt = question
    ? `${DEFAULT_USER_PROMPT}\n\n---\nPergunta de follow-up: ${question}`
    : DEFAULT_USER_PROMPT;

  return new Response(
    await buildLiveSseStream({
      systemPrompt,
      userPrompt,
      model,
      apiKey: env.OPENROUTER_API_KEY,
      hash,
      fixtureId: fixture_id,
      supabase: untypedSb,
    }),
    { status: 200, headers: sseHeaders() },
  );
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

const encoder = new TextEncoder();

interface SseMeta {
  model: string;
  cached?: boolean;
  system_prompt_chars?: number;
  latency_ms?: number;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens?: number };
  finish_reason?: string;
}

function encodeDelta(delta: string): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`);
}

function encodeMeta(meta: SseMeta): Uint8Array {
  return encoder.encode(`event: meta\ndata: ${JSON.stringify(meta)}\n\n`);
}

function encodeDone(): Uint8Array {
  return encoder.encode(`event: done\ndata: {}\n\n`);
}

function encodeError(message: string): Uint8Array {
  return encoder.encode(
    `event: error\ndata: ${JSON.stringify({ message })}\n\n`,
  );
}

/**
 * Single-chunk SSE stream for cache hits — emits the cached content as one
 * delta then the done event. Client treats it identically to a live stream.
 */
function buildCachedSseStream(
  content: string,
  meta: SseMeta,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeDelta(content));
      controller.enqueue(encodeMeta(meta));
      controller.enqueue(encodeDone());
      controller.close();
    },
  });
}

interface LiveMessagesArgs {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  model: string;
  apiKey: string;
}

async function buildLiveSseStreamFromMessages(
  args: LiveMessagesArgs,
): Promise<ReadableStream<Uint8Array>> {
  const systemPromptChars = args.messages.find((m) => m.role === "system")
    ?.content.length;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const startedAt = Date.now();
      let usage: SseMeta["usage"];
      try {
        const upstream = await streamChatCompletion({
          model: args.model,
          apiKey: args.apiKey,
          messages: args.messages,
          includeUsage: true,
        });
        const reader = upstream.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value?.delta) controller.enqueue(encodeDelta(value.delta));
            if (value?.usage) usage = value.usage;
          }
        } finally {
          reader.releaseLock();
        }
        controller.enqueue(
          encodeMeta({
            model: args.model,
            system_prompt_chars: systemPromptChars,
            latency_ms: Date.now() - startedAt,
            usage,
          }),
        );
        controller.enqueue(encodeDone());
      } catch (err) {
        const message =
          err instanceof OpenRouterError
            ? `upstream OpenRouter error ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown error";
        controller.enqueue(encodeError(message));
      } finally {
        controller.close();
      }
    },
  });
}

interface LiveStreamArgs {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  apiKey: string;
  hash: string;
  fixtureId: number;
  // Loose typing: the `fixtures`/`analysis_cache` tables aren't in the
  // generated Database type yet (see comment at the call site).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (t: string) => any };
}

/**
 * Proxy-mode SSE stream. Calls OpenRouter, forwards every `{ delta }` chunk
 * to the client, assembles the full content on the way through, and persists
 * the assembled content into `analysis_cache` after the upstream closes.
 *
 * Errors are emitted as `event: error` SSE frames (the response itself is
 * still 200 — the client is already reading the stream by then).
 */
async function buildLiveSseStream(
  args: LiveStreamArgs,
): Promise<ReadableStream<Uint8Array>> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let assembled = "";
      const startedAt = Date.now();
      let usage: SseMeta["usage"];
      try {
        const upstream = await streamChatCompletion({
          model: args.model,
          apiKey: args.apiKey,
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userPrompt },
          ],
          includeUsage: true,
        });
        const reader = upstream.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value?.delta) {
              assembled += value.delta;
              controller.enqueue(encodeDelta(value.delta));
            }
            if (value?.usage) usage = value.usage;
          }
        } finally {
          reader.releaseLock();
        }
        controller.enqueue(
          encodeMeta({
            model: args.model,
            system_prompt_chars: args.systemPrompt.length,
            latency_ms: Date.now() - startedAt,
            usage,
          }),
        );
        controller.enqueue(encodeDone());
        // Persist after the user has the full response — concurrent calls
        // are tolerated by the unique index on content_hash.
        if (assembled.length > 0) {
          await storeAnalysis(
            args.hash,
            args.fixtureId,
            assembled,
            args.supabase,
          ).catch(() => {
            /* swallow — stream already delivered */
          });
        }
      } catch (err) {
        const message =
          err instanceof OpenRouterError
            ? `upstream OpenRouter error ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown error";
        controller.enqueue(encodeError(message));
      } finally {
        controller.close();
      }
    },
  });
}
