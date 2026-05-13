import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fixture row factory — minimal shape the route needs from the DB.
 */
function makeFixtureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    match_date: "2026-05-12",
    ko_time: "20:00",
    home_team: "Tottenham",
    away_team: "Leeds",
    league: "Premier League",
    country: "england",
    source_url: "https://www.adamchoi.co.uk/fixture/123",
    kickoff_utc: "2026-05-12T19:00:00Z",
    detail_json: {
      team_record: {
        home: {
          overall: {
            position: 5,
            played: 30,
            won: 18,
            draw: 6,
            lost: 6,
            goals_for: 55,
            goals_against: 32,
            points: 60,
            points_per_game: 2.0,
            form: ["W", "W", "D", "L", "W"],
          },
        },
        away: {
          overall: {
            position: 14,
            played: 30,
            won: 9,
            draw: 8,
            lost: 13,
            goals_for: 35,
            goals_against: 45,
            points: 35,
            points_per_game: 1.16,
            form: ["L", "D", "L", "W", "D"],
          },
        },
      },
      recent_matches: { home: [], away: [] },
      h2h: [],
      streaks: { home: [], away: [] },
    },
    ...overrides,
  };
}

/**
 * Build a Supabase-admin mock that returns scripted rows based on the
 * (table, filter) pair. Tests configure `fixturesRow`, `cacheRow`, and
 * record insert payloads.
 */
type AdminState = {
  fixturesRow: ReturnType<typeof makeFixtureRow> | null;
  fixturesError: { code?: string; message: string } | null;
  cacheRow: { content: string } | null;
  insertedCacheRows: unknown[];
};

function buildAdminMock(state: AdminState) {
  return {
    from(table: string) {
      if (table === "fixtures") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: state.fixturesRow,
            error: state.fixturesError,
          }),
        };
      }
      if (table === "analysis_cache") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: state.cacheRow
              ? { response_json: { content: state.cacheRow.content } }
              : null,
            error: null,
          }),
          insert: async (row: unknown) => {
            state.insertedCacheRows.push(row);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// State + module mock are set up before each test.
const adminState: AdminState = {
  fixturesRow: makeFixtureRow(),
  fixturesError: null,
  cacheRow: null,
  insertedCacheRows: [],
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => buildAdminMock(adminState),
}));

// Reset env between tests so we can override OPENROUTER_API_KEY per case.
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  adminState.fixturesRow = makeFixtureRow();
  adminState.fixturesError = null;
  adminState.cacheRow = null;
  adminState.insertedCacheRows = [];
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

/**
 * Helper to read an SSE response body fully into a string. Cancels the
 * stream when done so tests don't leak readers.
 */
async function readBody(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  // Read until done — the route is expected to close.
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

/**
 * Encode an upstream OpenRouter-style SSE chunk that yields one delta.
 */
function openrouterDeltaChunk(text: string): string {
  const payload = {
    id: "chatcmpl-1",
    choices: [{ delta: { content: text } }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function openrouterReasoningChunk(text: string): string {
  const payload = {
    id: "chatcmpl-1",
    choices: [{ delta: { reasoning: text } }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function openrouterUsageChunk(usage: {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
}): string {
  // OpenRouter (and OpenAI) emit a final chunk with usage when
  // stream_options.include_usage is true. The choices array is empty.
  const payload = {
    id: "chatcmpl-1",
    choices: [],
    usage,
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function openrouterDoneChunk(): string {
  return `data: [DONE]\n\n`;
}

function fakeOpenrouterResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("POST /api/analyze", () => {
  it("returns 400 when fixture_id is missing", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when fixture_id is not a number", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: "abc" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when fixture not found", async () => {
    adminState.fixturesRow = null;
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 999 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when fixture has no detail_json (instructs client to refresh)", async () => {
    adminState.fixturesRow = makeFixtureRow({ detail_json: null });
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/refresh/i);
  });

  it("returns 503 when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("cache hit: streams the cached content as a single SSE delta + done event, without calling OpenRouter", async () => {
    adminState.cacheRow = { content: "análise em cache" };
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");
    const body = await readBody(res);
    expect(body).toContain(`data: ${JSON.stringify({ delta: "análise em cache" })}`);
    expect(body).toContain("event: done");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("cache miss: calls OpenRouter with stream=true, forwards deltas, persists assembled content", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("Olá "),
          openrouterDeltaChunk("mundo"),
          openrouterDoneChunk(),
        ]),
      );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await readBody(res);
    expect(body).toContain(`data: ${JSON.stringify({ delta: "Olá " })}`);
    expect(body).toContain(`data: ${JSON.stringify({ delta: "mundo" })}`);
    expect(body).toContain("event: done");

    // OpenRouter call args
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init?.method).toBe("POST");
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer sk-or-test-1");
    const payload = JSON.parse(String(init?.body));
    expect(payload.stream).toBe(true);
    expect(payload.model).toBe("deepseek/deepseek-v3.2");
    expect(Array.isArray(payload.messages)).toBe(true);
    expect(payload.messages[0].role).toBe("system");

    // Cache insert with assembled content
    expect(adminState.insertedCacheRows).toHaveLength(1);
    const inserted = adminState.insertedCacheRows[0] as {
      fixture_id: number;
      content_hash: string;
      response_json: { content: string };
    };
    expect(inserted.fixture_id).toBe(42);
    expect(inserted.response_json.content).toBe("Olá mundo");
    expect(typeof inserted.content_hash).toBe("string");
    expect(inserted.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("upstream OpenRouter error (500): emits SSE error event then closes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("internal server error", { status: 500 }),
    );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body).toContain("event: error");
    expect(body).toMatch(/data:\s*\{[^}]*"message"/);
    // No cache row persisted on error.
    expect(adminState.insertedCacheRows).toHaveLength(0);
  });

  it("hash determinism: same fixture + question produces same content_hash", async () => {
    const captured: string[] = [];

    async function runOnce() {
      adminState.insertedCacheRows = [];
      adminState.cacheRow = null;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("x"),
          openrouterDoneChunk(),
        ]),
      );
      vi.resetModules();
      const { POST } = await import("@/app/api/analyze/route");
      const req = new Request("http://x/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture_id: 42, question: "qual o palpite?" }),
      });
      const res = await POST(req);
      await readBody(res);
      const inserted = adminState.insertedCacheRows[0] as {
        content_hash: string;
      };
      captured.push(inserted.content_hash);
    }

    await runOnce();
    await runOnce();
    expect(captured[0]).toBe(captured[1]);
  });

  it("reasoner:true switches the upstream model to deepseek/deepseek-r1", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("ok"),
          openrouterDoneChunk(),
        ]),
      );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42, reasoner: true }),
    });
    const res = await POST(req);
    await readBody(res);
    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body));
    expect(payload.model).toBe("deepseek/deepseek-r1");
  });

  it("reasoner mode forwards reasoning chunks via SSE event:reasoning", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeOpenrouterResponse([
        openrouterReasoningChunk("Pensando: o time da casa tem 5W em 5… "),
        openrouterReasoningChunk("então favorito leve."),
        openrouterDeltaChunk("Análise:\n\nO time da casa é favorito."),
        openrouterDoneChunk(),
      ]),
    );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42, reasoner: true }),
    });
    const res = await POST(req);
    const body = await readBody(res);
    expect(body).toContain("event: reasoning");
    expect(body).toMatch(/data: \{"reasoning":"Pensando[^"]+"\}/);
    expect(body).toContain('"delta":"Análise:');
  });

  it("reasoner mode bypasses cache (different model than default)", async () => {
    adminState.cacheRow = { content: "cached pelo v3.2" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeOpenrouterResponse([
        openrouterDeltaChunk("nova resposta R1"),
        openrouterDoneChunk(),
      ]),
    );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42, reasoner: true }),
    });
    const res = await POST(req);
    const body = await readBody(res);
    expect(body).not.toContain("cached pelo v3.2");
    expect(body).toContain("nova resposta R1");
    // No insert either — the route should skip writing the R1 result to the
    // v3.2-keyed cache to avoid poisoning it.
    expect(adminState.insertedCacheRows).toHaveLength(0);
  });

  it("requests stream_options.include_usage so usage shows up in the stream", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("x"),
          openrouterUsageChunk({
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          }),
          openrouterDoneChunk(),
        ]),
      );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    await readBody(res);
    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body));
    expect(payload.stream_options).toEqual({ include_usage: true });
  });

  it("emits an SSE meta event with model, usage, system_prompt_chars, latency_ms before done", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeOpenrouterResponse([
        openrouterDeltaChunk("ok"),
        openrouterUsageChunk({
          prompt_tokens: 2500,
          completion_tokens: 700,
          total_tokens: 3200,
        }),
        openrouterDoneChunk(),
      ]),
    );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    const body = await readBody(res);
    // meta event must arrive (the order between meta and done matters less
    // than its mere presence — clients buffer until done).
    expect(body).toContain("event: meta");
    const metaLine = body.split("\n").find((l) => l.startsWith("data: ") && l.includes("\"model\""));
    expect(metaLine).toBeDefined();
    const meta = JSON.parse(metaLine!.slice(6));
    expect(meta).toMatchObject({
      model: "deepseek/deepseek-v3.2",
      usage: { prompt_tokens: 2500, completion_tokens: 700 },
    });
    expect(typeof meta.latency_ms).toBe("number");
    expect(meta.latency_ms).toBeGreaterThanOrEqual(0);
    expect(typeof meta.system_prompt_chars).toBe("number");
    expect(meta.system_prompt_chars).toBeGreaterThan(0);
  });

  it("cache hit: meta event includes a cached:true flag", async () => {
    adminState.cacheRow = { content: "cached answer" };
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42 }),
    });
    const res = await POST(req);
    const body = await readBody(res);
    expect(body).toContain("event: meta");
    const metaLine = body
      .split("\n")
      .find((l) => l.startsWith("data: ") && l.includes("\"cached\""));
    expect(metaLine).toBeDefined();
    const meta = JSON.parse(metaLine!.slice(6));
    expect(meta.cached).toBe(true);
  });

  it("multi-turn with messages[]: upstream gets system + history verbatim, no DEFAULT_USER_PROMPT wrap", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("resposta follow-up"),
          openrouterDoneChunk(),
        ]),
      );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture_id: 42,
        messages: [
          { role: "user", content: "[análise inicial pedida]" },
          { role: "assistant", content: "[análise pré-jogo gerada antes]" },
          { role: "user", content: "e os escanteios?" },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await readBody(res);

    const [, init] = fetchSpy.mock.calls[0];
    const payload = JSON.parse(String(init?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    // Should be: system + 3 history turns. No extra DEFAULT_USER_PROMPT injection.
    expect(payload.messages).toHaveLength(4);
    expect(payload.messages[0].role).toBe("system");
    expect(payload.messages[1]).toEqual({
      role: "user",
      content: "[análise inicial pedida]",
    });
    expect(payload.messages[2]).toEqual({
      role: "assistant",
      content: "[análise pré-jogo gerada antes]",
    });
    expect(payload.messages[3]).toEqual({
      role: "user",
      content: "e os escanteios?",
    });
    // System prompt is still built from the fixture context, not echoed from client.
    expect(payload.messages[0].content).toMatch(/Tottenham/);
    expect(payload.messages[0].content).not.toMatch(
      /Faça uma análise pré-jogo objetiva/,
    );
  });

  it("multi-turn with messages[]: bypasses cache (no insert, no lookup hit needed)", async () => {
    // Even if a cache row existed for the initial turn, follow-ups must not
    // serve it — the history is what makes this turn unique.
    adminState.cacheRow = { content: "stale initial analysis" };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      fakeOpenrouterResponse([
        openrouterDeltaChunk("nova resposta"),
        openrouterDoneChunk(),
      ]),
    );
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture_id: 42,
        messages: [
          { role: "user", content: "inicial" },
          { role: "assistant", content: "resposta" },
          { role: "user", content: "follow-up" },
        ],
      }),
    });
    const res = await POST(req);
    const body = await readBody(res);
    // Should NOT echo the cached stale content.
    expect(body).not.toContain("stale initial analysis");
    expect(body).toContain("nova resposta");
    // No cache insert either.
    expect(adminState.insertedCacheRows).toHaveLength(0);
  });

  it("rejects empty messages[] with 400", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: 42, messages: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects messages[] not ending with role=user", async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const req = new Request("http://x/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fixture_id: 42,
        messages: [
          { role: "user", content: "a" },
          { role: "assistant", content: "b" },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("question changes hash (follow-up creates a separate cache entry)", async () => {
    const captured: string[] = [];

    async function runWithQuestion(question?: string) {
      adminState.insertedCacheRows = [];
      adminState.cacheRow = null;
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        fakeOpenrouterResponse([
          openrouterDeltaChunk("x"),
          openrouterDoneChunk(),
        ]),
      );
      vi.resetModules();
      const { POST } = await import("@/app/api/analyze/route");
      const body =
        question === undefined ? { fixture_id: 42 } : { fixture_id: 42, question };
      const req = new Request("http://x/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const res = await POST(req);
      await readBody(res);
      const inserted = adminState.insertedCacheRows[0] as {
        content_hash: string;
      };
      captured.push(inserted.content_hash);
    }

    await runWithQuestion();
    await runWithQuestion("e sobre os cantos?");
    expect(captured[0]).not.toBe(captured[1]);
  });
});
