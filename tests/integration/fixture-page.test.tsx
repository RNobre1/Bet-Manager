import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";

/**
 * Guard de custo + regressão: abrir o jogo (montar a page) NÃO pode disparar
 * nenhuma chamada LLM (o resumo automático foi aposentado). O FAB do copilot
 * existe e só chama /api/fixture-copilot quando o usuário interage.
 */
describe("fixture page (stats-first)", () => {
  it("monta sem nenhuma chamada de rede no mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    return import("@/components/fixtures/fixture-copilot-drawer").then(async (mod) => {
      const { render } = await import("@testing-library/react");
      render(<mod.FixtureCopilotDrawer fixtureId={1} homeTeam="A" awayTeam="B" />);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
