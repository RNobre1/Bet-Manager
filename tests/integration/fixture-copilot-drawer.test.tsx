import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FixtureCopilotDrawer } from "@/components/fixtures/fixture-copilot-drawer";

beforeEach(() => vi.restoreAllMocks());

function setup() {
  return render(
    <FixtureCopilotDrawer fixtureId={7} homeTeam="Aston Villa" awayTeam="Liverpool" />,
  );
}

describe("FixtureCopilotDrawer", () => {
  it("FAB abre o drawer e ESC fecha", () => {
    setup();
    fireEvent.click(screen.getByLabelText("Abrir copilot do jogo"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza cada tool como passo visível (✓) e a resposta", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: "O árbitro é o Mike Dean.",
          meta: {
            model: "x", latency_ms: 12,
            usage_total: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            hops: [{ tool: "get_referee", args: {}, result_summary: "get_referee: ok", took_ms: 3 }],
          },
        }),
        { status: 200 },
      ) as Response,
    );
    setup();
    fireEvent.click(screen.getByLabelText("Abrir copilot do jogo"));
    fireEvent.change(screen.getByLabelText("Pergunta"), { target: { value: "quem apita?" } });
    fireEvent.submit(screen.getByLabelText("Pergunta").closest("form")!);
    await waitFor(() => expect(screen.getByText(/Mike Dean/)).toBeInTheDocument());
    expect(screen.getByText("get_referee")).toBeInTheDocument();
    expect(screen.getByText(/get_referee: ok/)).toBeInTheDocument();
  });

  it("mostra erro de tool com ✗", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: "Sem árbitro definido.",
          meta: {
            model: "x", latency_ms: 9,
            usage_total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            hops: [{ tool: "get_referee", args: {}, result_summary: "error: sem árbitro designado", took_ms: 2 }],
          },
        }),
        { status: 200 },
      ) as Response,
    );
    setup();
    fireEvent.click(screen.getByLabelText("Abrir copilot do jogo"));
    fireEvent.change(screen.getByLabelText("Pergunta"), { target: { value: "arbitro?" } });
    fireEvent.submit(screen.getByLabelText("Pergunta").closest("form")!);
    await waitFor(() => expect(screen.getByText(/error: sem árbitro/)).toBeInTheDocument());
  });
});
