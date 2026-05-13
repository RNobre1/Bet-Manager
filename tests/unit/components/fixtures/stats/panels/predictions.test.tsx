import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Predictions } from "@/components/fixtures/stats/panels/predictions";
import type { Prediction } from "@/lib/fixtures/stats/detail-json-types";

function p(over: Partial<Prediction> = {}): Prediction {
  return {
    stat_type: "over 8.5 corners",
    chance: 75,
    chance_team: null,
    best_odds: 1.85,
    best_odds_bookmaker: "Bet365",
    home_stats: ["média 5.2 cantos por jogo"],
    away_stats: ["média 4.8 cantos por jogo"],
    ...over,
  };
}

describe("<Predictions />", () => {
  it("renders null when array is empty", () => {
    const { container } = render(<Predictions data={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders entries ordered by chance DESC", () => {
    const data = [
      p({ stat_type: "btts yes", chance: 60 }),
      p({ stat_type: "over 2.5 goals", chance: 80 }),
      p({ stat_type: "over 8.5 corners", chance: 75 }),
    ];
    const { container } = render(<Predictions data={data} />);
    const cards = Array.from(container.querySelectorAll("[data-prediction]")) as HTMLElement[];
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toMatch(/over 2.5 goals/i);
    expect(cards[1].textContent).toMatch(/over 8.5 corners/i);
    expect(cards[2].textContent).toMatch(/btts yes/i);
  });

  it("renders the chip with chance % + stat_type", () => {
    render(<Predictions data={[p()]} />);
    expect(screen.getByText(/75/)).toBeDefined();
    expect(screen.getByText(/over 8.5 corners/i)).toBeDefined();
  });

  it("renders best_odds and bookmaker", () => {
    render(<Predictions data={[p()]} />);
    expect(screen.getByText("1.85")).toBeDefined();
    expect(screen.getByText(/Bet365/)).toBeDefined();
  });

  it("renders home_stats and away_stats bullets", () => {
    render(<Predictions data={[p()]} />);
    expect(screen.getByText(/5\.2 cantos/i)).toBeDefined();
    expect(screen.getByText(/4\.8 cantos/i)).toBeDefined();
  });
});
