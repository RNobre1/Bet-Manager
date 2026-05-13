/**
 * OpenRouter streaming chat completions client.
 *
 * Returns a `ReadableStream<{ delta: string }>` that emits one chunk per
 * `choices[0].delta.content` fragment in the upstream SSE stream. Upstream
 * non-2xx responses surface as `OpenRouterError`. The caller decides whether
 * to translate the error into an SSE `event: error` chunk or a JSON body.
 *
 * `fetcher` is injectable for tests (no network in the suite). It mirrors
 * the global `fetch` signature so production code can leave it undefined.
 */

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  cost?: number;
}

/**
 * Union shape emitted by the parsed stream — most chunks carry a delta,
 * the final one (when include_usage is on) carries the usage object.
 */
export type ChatChunk =
  | { delta: string; usage?: undefined }
  | { delta?: undefined; usage: OpenRouterUsage };

export interface StreamChatCompletionOpts {
  messages: OpenRouterMessage[];
  model: string;
  apiKey: string;
  fetcher?: typeof fetch;
  /**
   * Optional headers that OpenRouter recommends for analytics + attribution.
   * Defaults are baked in (HTTP-Referer + X-Title) but can be overridden.
   */
  referer?: string;
  title?: string;
  signal?: AbortSignal;
  /**
   * Ask the upstream to include a final `usage` chunk in the stream. Adds
   * `stream_options: { include_usage: true }` to the request body — OpenAI-
   * compatible providers (including OpenRouter) honor this.
   */
  includeUsage?: boolean;
}

export class OpenRouterError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`OpenRouter upstream error ${status}`);
    this.status = status;
    this.body = body;
  }
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_REFERER = "https://abissal.rnobre.dev";
const DEFAULT_TITLE = "Abissal";

export async function streamChatCompletion(
  opts: StreamChatCompletionOpts,
): Promise<ReadableStream<ChatChunk>> {
  const fetcher = opts.fetcher ?? fetch;
  const body: Record<string, unknown> = {
    model: opts.model,
    stream: true,
    messages: opts.messages,
  };
  if (opts.includeUsage) {
    body.stream_options = { include_usage: true };
  }
  const res = await fetcher(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": opts.referer ?? DEFAULT_REFERER,
      "X-Title": opts.title ?? DEFAULT_TITLE,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const resBody = res.body ? await res.text().catch(() => "") : "";
    throw new OpenRouterError(res.status, resBody);
  }

  return parseOpenRouterSseStream(res.body);
}

/**
 * Convert OpenRouter's line-delimited `data: {json}\n\n` SSE stream into
 * a stream of `{ delta }` objects. Yields one chunk per non-empty
 * `choices[0].delta.content` fragment; ignores keepalives, comments,
 * and the terminal `data: [DONE]` sentinel.
 */
export function parseOpenRouterSseStream(
  upstream: ReadableStream<Uint8Array>,
): ReadableStream<ChatChunk> {
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<ChatChunk>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by a blank line. Process every complete event.
          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            const parsed = parseSseEvent(rawEvent);
            if (parsed === "DONE") {
              controller.close();
              return;
            }
            if (parsed === null) continue;
            if (parsed.usage) controller.enqueue({ usage: parsed.usage });
            if (parsed.delta && parsed.delta.length > 0) {
              controller.enqueue({ delta: parsed.delta });
            }
          }
        }
        if (buffer.trim().length > 0) {
          const parsed = parseSseEvent(buffer);
          if (parsed && parsed !== "DONE") {
            if (parsed.usage) controller.enqueue({ usage: parsed.usage });
            if (parsed.delta && parsed.delta.length > 0) {
              controller.enqueue({ delta: parsed.delta });
            }
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        reader.releaseLock();
      }
    },
  });
}

type ParsedEvent =
  | "DONE"
  | { delta?: string; usage?: OpenRouterUsage }
  | null;

function parseSseEvent(rawEvent: string): ParsedEvent {
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  if (data === "[DONE]") return "DONE";
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: OpenRouterUsage;
    };
    const out: { delta?: string; usage?: OpenRouterUsage } = {};
    const content = parsed.choices?.[0]?.delta?.content;
    if (typeof content === "string") out.delta = content;
    if (parsed.usage) out.usage = parsed.usage;
    return out;
  } catch {
    return { delta: "" };
  }
}
