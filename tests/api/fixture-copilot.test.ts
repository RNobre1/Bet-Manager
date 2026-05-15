import { describe, it, expect, vi, beforeEach } from "vitest";

const fixtureRow = {
  id: 7,
  home_team: "Aston Villa",
  away_team: "Liverpool",
  detail_json: {
    referee_record: { name: "Mike Dean", avg_booking_points: 42 },
    recent_matches: { home: [], away: [] },
  },
};

const fixtureRowNoDetail = {
  id: 8,
  home_team: "Chelsea",
  away_team: "Manchester City",
  detail_json: null,
};

function adminMock() {
  return {
    from: (table: string) => {
      if (table === "fixtures") {
        return {
          select: () => ({
            eq: (_k: string, v: number) => ({
              maybeSingle: async () => {
                if (v === fixtureRow.id) {
                  return { data: fixtureRow, error: null };
                }
                if (v === fixtureRowNoDetail.id) {
                  return { data: fixtureRowNoDetail, error: null };
                }
                return { data: null, error: null };
              },
            }),
          }),
        };
      }
      if (table === "llm_request_logs") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      return {};
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => adminMock() }));
vi.mock("@/lib/env", () => ({
  env: { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "deepseek/deepseek-v3.2" },
}));

import { POST } from "@/app/api/fixture-copilot/route";

beforeEach(() => vi.restoreAllMocks());

describe("POST /api/fixture-copilot", () => {
  it("400 quando body inválido", async () => {
    const res = await POST(new Request("http://t", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
  });

  it("loop executa tool e devolve {content, meta.hops}", async () => {
    const calls: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_u, init) => {
      calls.push(init);
      if (calls.length === 1) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: null,
              tool_calls: [{ id: "c1", type: "function",
                function: { name: "get_referee", arguments: "{}" } }] } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "O árbitro é o Mike Dean (42)." } }],
          usage: { prompt_tokens: 8, completion_tokens: 9 },
        }),
        { status: 200 },
      );
    });

    const res = await POST(new Request("http://t", {
      method: "POST",
      body: JSON.stringify({ fixture_id: 7, messages: [{ role: "user", content: "quem apita?" }] }),
    }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { content: string; meta: { hops: Array<{ tool: string }> } };
    expect(json.content).toContain("Mike Dean");
    expect(json.meta.hops.map((h) => h.tool)).toContain("get_referee");
  });

  it("404 quando fixture não existe", async () => {
    const res = await POST(new Request("http://t", {
      method: "POST",
      body: JSON.stringify({ fixture_id: 999999, messages: [{ role: "user", content: "x" }] }),
    }));
    expect(res.status).toBe(404);
  });

  it("400 quando fixture existe mas detail_json é null", async () => {
    const res = await POST(new Request("http://t", {
      method: "POST",
      body: JSON.stringify({ fixture_id: 8, messages: [{ role: "user", content: "x" }] }),
    }));
    expect(res.status).toBe(400);
  });
});
