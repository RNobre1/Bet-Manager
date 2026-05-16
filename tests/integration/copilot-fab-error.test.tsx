import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopilotFab } from "@/components/fixtures/copilot-fab";

beforeEach(() => vi.restoreAllMocks());

function openFab() {
  render(<CopilotFab date="today" />);
  fireEvent.click(screen.getByLabelText("Abrir copilot"));
}

function submitQuestion(question: string) {
  fireEvent.change(screen.getByPlaceholderText(/pergunte sobre os jogos do dia/i), {
    target: { value: question },
  });
  fireEvent.submit(
    screen.getByPlaceholderText(/pergunte sobre os jogos do dia/i).closest("form")!,
  );
}

describe("CopilotFab — parse defensivo da resposta", () => {
  it("body não-JSON (502 HTML) exibe mensagem amigável e não vaza JSON.parse", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<!DOCTYPE html><title>error</title>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }) as Response,
    );

    openFab();
    submitQuestion("qualquer coisa");

    await waitFor(() =>
      expect(
        screen.getByText(/demorou demais ou falhou/i),
      ).toBeInTheDocument(),
    );

    expect(screen.queryByText(/JSON\.parse/i)).not.toBeInTheDocument();
  });

  it("resposta ok com JSON válido renderiza o conteúdo do assistente (happy path)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          content: "oi",
          meta: {
            model: "m",
            latency_ms: 1,
            hops: [],
            usage_total: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
          },
        }),
        { status: 200 },
      ) as Response,
    );

    openFab();
    submitQuestion("teste happy path");

    await waitFor(() =>
      expect(screen.getByText("oi")).toBeInTheDocument(),
    );
  });

  it("JSON de erro com status 502 exibe a mensagem de erro do body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "serviço indisponível" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      }) as Response,
    );

    openFab();
    submitQuestion("teste erro json");

    await waitFor(() =>
      expect(screen.getByText(/serviço indisponível/i)).toBeInTheDocument(),
    );
  });
});
