import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadarComparison } from "@/components/fixtures/stats/panels/radar-comparison";
import type { RadarData } from "@/lib/fixtures/stats/detail-json-types";

const radar: RadarData = {
  axes: [
    { key: "goals_per_game", label: "Gols/jogo", home: 2, away: 1.4, home_norm: 1, away_norm: 0.7 },
    { key: "goals_conceded", label: "Gols sofridos", home: 0.8, away: 1.1, home_norm: 0.72, away_norm: 1 },
    { key: "sot", label: "Chutes no gol", home: 5, away: 4.2, home_norm: 1, away_norm: 0.84 },
    { key: "booking_points", label: "Booking points", home: 12, away: 17, home_norm: 0.7, away_norm: 1 },
    { key: "corners", label: "Cantos", home: 6, away: 4, home_norm: 1, away_norm: 0.66 },
    { key: "fouls", label: "Faltas", home: 11, away: 13, home_norm: 0.84, away_norm: 1 },
  ],
};

describe("<RadarComparison />", () => {
  it("renders all 6 axis labels", () => {
    render(
      <RadarComparison
        homeTeam="Tottenham"
        awayTeam="Leeds"
        data={radar}
        width={400}
        height={400}
      />,
    );
    expect(screen.getByText(/Gols\/jogo/)).toBeDefined();
    expect(screen.getByText(/Gols sofridos/)).toBeDefined();
    expect(screen.getByText(/Chutes no gol/)).toBeDefined();
    expect(screen.getByText(/Booking points/)).toBeDefined();
    expect(screen.getByText(/Cantos/)).toBeDefined();
    expect(screen.getByText(/Faltas/)).toBeDefined();
  });

  it("renders two overlaid <Radar> polygons (home + away)", () => {
    const { container } = render(
      <RadarComparison
        homeTeam="Tottenham"
        awayTeam="Leeds"
        data={radar}
        width={400}
        height={400}
      />,
    );
    // recharts wraps each <Radar> in <g class="recharts-radar-polygon">.
    const polygons = container.querySelectorAll("g.recharts-radar-polygon");
    expect(polygons.length).toBe(2);
  });

  it("renders 'sem dados' fallback for empty axes", () => {
    render(
      <RadarComparison
        homeTeam="A"
        awayTeam="B"
        data={{ axes: [] }}
        width={400}
        height={400}
      />,
    );
    expect(screen.getByText(/sem dados/i)).toBeDefined();
  });
});
