import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScatterPlayground } from "@/components/fixtures/stats/panels/scatter-playground";
import type { NormalizedRecentMatch } from "@/lib/fixtures/stats/detail-json-types";

function mk(
  id: number,
  isHome: boolean,
  goals: number,
  sot: number,
  corners: number,
): NormalizedRecentMatch {
  return {
    id,
    date_iso: `2026-04-${String(id).padStart(2, "0")}`,
    opponent: "Opp",
    is_home: isHome,
    result: "W",
    goals_1h_for: 0,
    goals_2h_for: 0,
    goals_1h_against: 0,
    goals_2h_against: 0,
    goals_ft_for: goals,
    goals_ft_against: 0,
    corners_1h_for: 0,
    corners_2h_for: 0,
    corners_1h_against: 0,
    corners_2h_against: 0,
    corners_for: corners,
    corners_against: 0,
    cards_1h_for: 0,
    cards_2h_for: 0,
    cards_1h_against: 0,
    cards_2h_against: 0,
    cards_for: 0,
    cards_against: 0,
    sot_for: sot,
    sot_against: 0,
    shots_for: 0,
    shots_against: 0,
    booking_points_for: 0,
    booking_points_against: 0,
    fouls_for: 0,
    fouls_against: 0,
    offsides_for: 0,
    offsides_against: 0,
  };
}

const home: NormalizedRecentMatch[] = [
  mk(1, true, 1, 3, 5),
  mk(2, true, 2, 5, 4),
  mk(3, true, 3, 7, 6),
  mk(4, true, 2, 4, 5),
];
const away: NormalizedRecentMatch[] = [
  mk(5, false, 0, 2, 3),
  mk(6, false, 1, 4, 4),
  mk(7, false, 2, 6, 5),
  mk(8, false, 1, 3, 4),
];

describe("<ScatterPlayground />", () => {
  it("defaults to X=sot, Y=goals_ft", () => {
    render(
      <ScatterPlayground
        homeTeam="Tottenham"
        awayTeam="Leeds"
        home={home}
        away={away}
        width={420}
        height={300}
      />,
    );
    const xSelect = screen.getByLabelText(/eixo x/i) as HTMLSelectElement;
    const ySelect = screen.getByLabelText(/eixo y/i) as HTMLSelectElement;
    expect(xSelect.value).toBe("sot_for");
    expect(ySelect.value).toBe("goals_ft_for");
  });

  it("renders both team scatter groups", () => {
    const { container } = render(
      <ScatterPlayground
        homeTeam="Tottenham"
        awayTeam="Leeds"
        home={home}
        away={away}
        width={420}
        height={300}
      />,
    );
    // recharts <Scatter> renders <g class="recharts-scatter">
    const groups = container.querySelectorAll("g.recharts-scatter");
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });

  it("shows Pearson r in the header", () => {
    render(
      <ScatterPlayground
        homeTeam="Tottenham"
        awayTeam="Leeds"
        home={home}
        away={away}
        width={420}
        height={300}
      />,
    );
    // Goals strongly correlated with SOT in our fixture data → r > 0.5.
    const header = screen.getByTestId("scatter-pearson");
    const value = Number(header.textContent?.match(/-?\d+\.\d+/)?.[0]);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0.5);
  });

  it("changing X axis re-renders dots and updates r", () => {
    render(
      <ScatterPlayground
        homeTeam="Tottenham"
        awayTeam="Leeds"
        home={home}
        away={away}
        width={420}
        height={300}
      />,
    );
    const xSelect = screen.getByLabelText(/eixo x/i) as HTMLSelectElement;
    fireEvent.change(xSelect, { target: { value: "corners_for" } });
    expect(xSelect.value).toBe("corners_for");
    // r is recomputed — still a number.
    const header = screen.getByTestId("scatter-pearson");
    expect(header.textContent).toMatch(/-?\d+\.\d+/);
  });

  it("renders a trend line", () => {
    const { container } = render(
      <ScatterPlayground
        homeTeam="Tottenham"
        awayTeam="Leeds"
        home={home}
        away={away}
        width={420}
        height={300}
      />,
    );
    // The trend line is rendered as a recharts <Line> on top.
    const trend = container.querySelectorAll("path.recharts-line-curve");
    expect(trend.length).toBeGreaterThanOrEqual(1);
  });

  it("renders 'sem dados' fallback when both teams empty", () => {
    render(
      <ScatterPlayground
        homeTeam="A"
        awayTeam="B"
        home={[]}
        away={[]}
        width={420}
        height={300}
      />,
    );
    expect(screen.getByText(/sem dados/i)).toBeDefined();
  });
});
