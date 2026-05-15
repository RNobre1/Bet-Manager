/**
 * Read side of `llm_request_logs` — used by the /logs dashboard page.
 *
 * Kept separate from `lib/llm-logs.ts` (write side) so the route can hot-path
 * insert without importing query helpers, and so tests can mock either side
 * independently.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromSupabase = { from: (table: string) => any };

export interface LogRow {
  id: number;
  created_at: string; // ISO UTC
  route: "analyze" | "copilot" | "fixture-copilot";
  fixture_id: number | null;
  model: string;
  cached: boolean;
  reasoner: boolean;
  follow_up: boolean;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  hops: unknown;
  error: string | null;
}

export interface LogsFilter {
  route?: "analyze" | "copilot" | "fixture-copilot";
  since?: string; // ISO date
  limit?: number;
}

export async function fetchLogs(
  supabase: FromSupabase,
  filter: LogsFilter = {},
): Promise<LogRow[]> {
  const limit = clampLimit(filter.limit);
  let q = supabase
    .from("llm_request_logs")
    .select(
      "id, created_at, route, fixture_id, model, cached, reasoner, follow_up, latency_ms, prompt_tokens, completion_tokens, total_tokens, hops, error",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter.route) q = q.eq("route", filter.route);
  if (filter.since) q = q.gte("created_at", filter.since);
  const { data, error } = await q;
  if (error) throw new Error(error.message ?? "failed to fetch llm logs");
  return (data ?? []) as LogRow[];
}

export interface LogsSummary {
  total_calls: number;
  errors: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  avg_latency_ms: number | null;
  cached_share: number;
  reasoner_share: number;
}

export function summarize(rows: LogRow[]): LogsSummary {
  if (rows.length === 0) {
    return {
      total_calls: 0,
      errors: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      avg_latency_ms: null,
      cached_share: 0,
      reasoner_share: 0,
    };
  }
  let promptT = 0;
  let completionT = 0;
  let totalT = 0;
  let latencySum = 0;
  let latencyCount = 0;
  let errors = 0;
  let cached = 0;
  let reasoner = 0;
  for (const r of rows) {
    promptT += r.prompt_tokens ?? 0;
    completionT += r.completion_tokens ?? 0;
    totalT += r.total_tokens ?? (r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0);
    if (typeof r.latency_ms === "number") {
      latencySum += r.latency_ms;
      latencyCount += 1;
    }
    if (r.error) errors += 1;
    if (r.cached) cached += 1;
    if (r.reasoner) reasoner += 1;
  }
  return {
    total_calls: rows.length,
    errors,
    prompt_tokens: promptT,
    completion_tokens: completionT,
    total_tokens: totalT,
    avg_latency_ms: latencyCount > 0 ? Math.round(latencySum / latencyCount) : null,
    cached_share: cached / rows.length,
    reasoner_share: reasoner / rows.length,
  };
}

function clampLimit(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return 100;
  return Math.max(1, Math.min(500, Math.floor(input)));
}
