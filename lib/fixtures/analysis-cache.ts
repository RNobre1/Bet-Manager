import { createHash } from "node:crypto";

/**
 * Minimal supabase-client surface this module needs. We accept anything
 * with a `.from(table)` factory — the real `SupabaseClient` satisfies it,
 * and tests can pass a hand-rolled mock. We don't import the heavy
 * `SupabaseClient` generic here because the `fixtures` / `analysis_cache`
 * tables aren't in the generated `Database` type yet.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromSupabase = { from: (table: string) => any };

/**
 * SHA-256 of the canonical analysis input. The hash is the cache key — same
 * model + fixture + question + detail_json ⇒ same hash ⇒ cache hit.
 *
 * We stringify `detail_json` directly. Stability matters for cache hits, so
 * callers should always pass the same row shape (the `detail_json` returned
 * by Supabase is deterministic per fixture revision).
 */
export interface ComputeContentHashOpts {
  model: string;
  fixtureId: number;
  question: string | undefined;
  detailJson: unknown;
}

export function computeContentHash(opts: ComputeContentHashOpts): string {
  const payload = [
    opts.model,
    String(opts.fixtureId),
    opts.question ?? "",
    JSON.stringify(opts.detailJson ?? null),
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Look up a cached analysis by content_hash. Returns `null` on miss.
 * `response_json.content` is the assembled assistant message text.
 */
export async function lookupByHash(
  hash: string,
  supabase: FromSupabase,
): Promise<{ content: string } | null> {
  const { data, error } = await supabase
    .from("analysis_cache")
    .select("response_json")
    .eq("content_hash", hash)
    .maybeSingle();
  if (error || !data) return null;
  const responseJson = (data as { response_json?: { content?: unknown } })
    .response_json;
  const content = responseJson?.content;
  if (typeof content !== "string") return null;
  return { content };
}

/**
 * Persist a freshly-generated analysis. Concurrent calls are tolerated:
 * the table has `UNIQUE (content_hash)`, so a parallel insert just no-ops
 * (we swallow the conflict error). Returns true on insert, false on noop.
 */
export async function storeAnalysis(
  hash: string,
  fixtureId: number,
  content: string,
  supabase: FromSupabase,
): Promise<boolean> {
  const { error } = await supabase.from("analysis_cache").insert({
    fixture_id: fixtureId,
    content_hash: hash,
    response_json: { content },
  });
  if (!error) return true;
  // Postgres unique_violation = 23505 (concurrent write to the same hash).
  // Anything else is unexpected but non-fatal; we already streamed the
  // response to the client.
  return false;
}
