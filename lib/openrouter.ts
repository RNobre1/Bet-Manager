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
): Promise<ReadableStream<{ delta: string }>> {
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": opts.referer ?? DEFAULT_REFERER,
      "X-Title": opts.title ?? DEFAULT_TITLE,
    },
    body: JSON.stringify({
      model: opts.model,
      stream: true,
      messages: opts.messages,
    }),
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const body = res.body ? await res.text().catch(() => "") : "";
    throw new OpenRouterError(res.status, body);
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
): ReadableStream<{ delta: string }> {
  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<{ delta: string }>({
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
            const delta = extractDeltaFromEvent(rawEvent);
            if (delta !== null) {
              if (delta === "__DONE__") {
                controller.close();
                return;
              }
              if (delta.length > 0) controller.enqueue({ delta });
            }
          }
        }
        // Flush whatever lingers (last event sometimes lacks trailing blank line).
        if (buffer.trim().length > 0) {
          const delta = extractDeltaFromEvent(buffer);
          if (delta && delta !== "__DONE__" && delta.length > 0) {
            controller.enqueue({ delta });
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

function extractDeltaFromEvent(rawEvent: string): string | null {
  // An SSE event can be multi-line; OpenRouter emits a single `data: ...` line
  // per event in practice, but be safe and concatenate all data lines.
  const dataLines: string[] = [];
  for (const line of rawEvent.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  const data = dataLines.join("\n");
  if (data === "[DONE]") return "__DONE__";
  try {
    const parsed = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.delta?.content;
    return typeof content === "string" ? content : "";
  } catch {
    return "";
  }
}
