import { fireEvent } from "@testing-library/react";

/**
 * Em jsdom (sem matchMedia mockado), o useIsMobile devolve false →
 * SimulationDisclosure mounta recolhida. Os testes que verificam o
 * conteúdo da simulação precisam expandir primeiro. Esse helper acha o
 * toggle dentro do painel e clica se estiver recolhido. Idempotente.
 */
export function expandSim(panel: HTMLElement): void {
  const toggle = panel.querySelector(
    'button[aria-expanded]',
  ) as HTMLButtonElement | null;
  if (!toggle) return;
  if (toggle.getAttribute("aria-expanded") === "true") return;
  fireEvent.click(toggle);
}
