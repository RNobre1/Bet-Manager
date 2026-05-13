import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for POST /api/copilot — the fixtures-day chat backed by tool calls.
 *
 * The route runs a loop:
 *   1. Call OpenRouter with system + messages + tools.
 *   2. If the response includes tool_calls, execute query_fixtures and
 *      re-call with the tool results appended.
 *   3. Loop bounded at 3 hops to keep token cost capped.
 *   4. Return the final text content as JSON.
 *
 * No streaming for the first version — keeps the tool dance simple.
 */

type AdminState = {
  rows: unknown[];
};

const adminState: AdminState = { rows: [] };

function buildAdminMock(state: AdminState) {
  return {
    from(table: string) {
      if (table !== "fixtures") throw new Error("unexpected table: " + table);
      const chain = {
        select() {
          return chain;
        },
        or() {
          return chain;
        },
        order() {
          return chain;
        },
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: state.rows, error: null });
        },
      };
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminMock(adminState),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  adminState.rows = [];
  process.env = {
    ...ORIGINAL_ENV,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk_test_1",
    SUPABASE_SERVICE_ROLE_KEY: "sk_test_1",
    OPENROUTER_API_KEY: "sk-or-test-1",
    OPENROUTER_MODEL: "deepseek/deepseek-v3.2",
  };
  vi.resetModules();
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toolCallResponse(name: string, args: object, id = "call_1") {
  return jsonResponse({
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
      },
    ],
  });
}

function finalResponse(content: string) {
  return jsonResponse({
    choices: [
      {
        message: { role: "assistant", content },
      },
    ],
  });
}

describe("POST /api/copilot", () => {
  it("returns 400 on missing messages[]", async () => {
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when messages[] is empty", async () => {
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "oi" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });

  it("plain answer (no tool call): returns content directly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      finalResponse("oi! como posso ajudar?"),
    );
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "oi" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toBe("oi! como posso ajudar?");
  });

  it("tool round-trip: executes query_fixtures, feeds result back, returns final text", async () => {
    adminState.rows = [
      {
        id: 7,
        match_date: "2026-05-12",
        ko_time: "20:00",
        home_team: "Botafogo",
        away_team: "Flamengo",
        league: "Brasileirão Série A",
        country: "brazil",
        source_url: null,
        kickoff_utc: "2026-05-12T23:00:00Z",
        detail_json: null,
      },
    ];

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        toolCallResponse("query_fixtures", { date: "today", country: "brazil" }),
      )
      .mockResolvedValueOnce(
        finalResponse("Encontrei 1 jogo hoje no Brasil: Botafogo vs Flamengo às 20:00 BRT."),
      );

    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "tem jogo no Brasil hoje?" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content).toMatch(/Botafogo vs Flamengo/);

    // Two upstream calls — initial + after-tool.
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // Second call must include the tool result with Botafogo data.
    const [, init2] = fetchSpy.mock.calls[1];
    const payload2 = JSON.parse(String(init2?.body)) as {
      messages: Array<{ role: string; content?: string; tool_call_id?: string }>;
    };
    const toolMsg = payload2.messages.find((m) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg!.tool_call_id).toBe("call_1");
    expect(toolMsg!.content).toMatch(/Botafogo/);
  });

  it("loop cap: aborts after 3 hops and returns a safe message", async () => {
    // Always respond with a tool call — verify we don't loop forever.
    // mockImplementation so each call gets a fresh Response (bodies are
    // single-shot — reusing the same instance would error on hop 2).
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      toolCallResponse("query_fixtures", {}, "call_X"),
    );
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "?" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.content).toBe("string");
    expect(body.content.length).toBeGreaterThan(0);
  });

  it("upstream error: returns 502 with details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 }),
    );
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "?" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(502);
  });

  it("rejects messages[] not ending with role=user", async () => {
    const { POST } = await import("@/app/api/copilot/route");
    const req = new Request("http://x/api/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "a" },
          { role: "assistant", content: "b" },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
