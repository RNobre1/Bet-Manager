import { describe, it, expect } from "vitest";
import { summarize, type LogRow } from "@/lib/llm-logs-repository";

function row(over: Partial<LogRow> = {}): LogRow {
  return {
    id: 1,
    created_at: "2026-05-12T20:00:00Z",
    route: "analyze",
    fixture_id: 42,
    model: "deepseek/deepseek-v3.2",
    cached: false,
    reasoner: false,
    follow_up: false,
    latency_ms: 1000,
    prompt_tokens: 100,
    completion_tokens: 200,
    total_tokens: 300,
    hops: null,
    error: null,
    ...over,
  };
}

describe("summarize", () => {
  it("returns zeros for empty input", () => {
    const s = summarize([]);
    expect(s.total_calls).toBe(0);
    expect(s.avg_latency_ms).toBeNull();
    expect(s.errors).toBe(0);
    expect(s.cached_share).toBe(0);
  });

  it("totals tokens across rows", () => {
    const s = summarize([
      row({ prompt_tokens: 100, completion_tokens: 50 }),
      row({ prompt_tokens: 300, completion_tokens: 150 }),
    ]);
    expect(s.prompt_tokens).toBe(400);
    expect(s.completion_tokens).toBe(200);
    expect(s.total_tokens).toBe(600);
  });

  it("falls back to prompt+completion when total_tokens is null", () => {
    const s = summarize([
      row({ prompt_tokens: 80, completion_tokens: 20, total_tokens: null }),
    ]);
    expect(s.total_tokens).toBe(100);
  });

  it("averages latency over rows that have it, ignoring nulls", () => {
    const s = summarize([
      row({ latency_ms: 1000 }),
      row({ latency_ms: 2000 }),
      row({ latency_ms: null }),
    ]);
    expect(s.avg_latency_ms).toBe(1500);
  });

  it("counts errors and cached share", () => {
    const s = summarize([
      row({}),
      row({ error: "boom" }),
      row({ cached: true }),
      row({ cached: true, error: "boom2" }),
    ]);
    expect(s.errors).toBe(2);
    expect(s.cached_share).toBe(0.5);
  });

  it("reasoner_share is the fraction of rows with reasoner=true", () => {
    const s = summarize([
      row({ reasoner: true }),
      row({ reasoner: false }),
      row({ reasoner: false }),
      row({ reasoner: false }),
    ]);
    expect(s.reasoner_share).toBe(0.25);
  });
});
