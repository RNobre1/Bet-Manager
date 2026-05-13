import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Splits1h2h as Splits1h2hPanel } from "@/components/fixtures/stats/panels/splits-1h-2h";
import type { Splits1h2h } from "@/lib/fixtures/stats/detail-json-types";

function splits(over: Partial<Splits1h2h> = {}): Splits1h2h {
  return {
    goals_1h_avg: 1.2,
    goals_2h_avg: 1.8,
    corners_1h_avg: 4.0,
    corners_2h_avg: 5.5,
    cards_1h_avg: 0.8,
    cards_2h_avg: 1.4,
    sot_for_avg: 3.0,
    ...over,
  };
}

describe("<Splits1h2h />", () => {
  it("renders 6 bar rows (goals/corners/cards × 1H/2H)", () => {
    const { container } = render(<Splits1h2hPanel data={splits()} />);
    const rows = container.querySelectorAll("[data-bar-row]");
    expect(rows.length).toBe(6);
  });

  it("bar widths are proportional to the max value across all 6 metrics", () => {
    const { container } = render(<Splits1h2hPanel data={splits()} />);
    const bars = Array.from(container.querySelectorAll("[data-bar-fill]")) as HTMLElement[];
    // max is 5.5 (corners_2h); that bar must be 100% wide
    const widths = bars.map((b) => b.style.width);
    expect(widths.some((w) => w === "100%")).toBe(true);
    // smallest (cards_1h=0.8) → ~14.5%
    const smallest = widths.find((w) => w.startsWith("14"));
    expect(smallest).toBeDefined();
  });

  it("renders zero-width bars without crashing when all averages are 0", () => {
    const { container } = render(
      <Splits1h2hPanel
        data={splits({
          goals_1h_avg: 0,
          goals_2h_avg: 0,
          corners_1h_avg: 0,
          corners_2h_avg: 0,
          cards_1h_avg: 0,
          cards_2h_avg: 0,
        })}
      />,
    );
    const bars = Array.from(container.querySelectorAll("[data-bar-fill]")) as HTMLElement[];
    expect(bars.length).toBe(6);
    for (const b of bars) expect(b.style.width).toBe("0%");
  });

  it("labels each metric (Gols, Cantos, Cartões) and half (1T, 2T)", () => {
    const { container } = render(<Splits1h2hPanel data={splits()} />);
    expect(container.textContent).toMatch(/Gols/i);
    expect(container.textContent).toMatch(/Cantos/i);
    expect(container.textContent).toMatch(/Cart/i);
    expect(container.textContent).toMatch(/1T/);
    expect(container.textContent).toMatch(/2T/);
  });
});
