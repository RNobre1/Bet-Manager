import { describe, it, expect, vi } from "vitest";
import { recordLlmRequest, type LlmLogInput } from "@/lib/llm-logs";

describe("recordLlmRequest route union", () => {
  it("accepts route='fixture-copilot' and inserts it verbatim", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: () => ({ insert }) };
    const log: LlmLogInput = {
      route: "fixture-copilot",
      fixture_id: 42,
      model: "deepseek/deepseek-v3.2",
      hops: [{ tool: "get_insights", args: {}, result_summary: "ok", took_ms: 3 }],
    };
    await recordLlmRequest(admin, log);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ route: "fixture-copilot", fixture_id: 42 }),
    );
  });
});
