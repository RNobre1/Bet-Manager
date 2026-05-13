import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { H2H } from "@/components/fixtures/stats/panels/h2h";
import type { RawRecentMatch } from "@/lib/fixtures/stats/detail-json-types";

function match(over: Partial<RawRecentMatch> = {}): RawRecentMatch {
  return {
    id: 1,
    date: 0,
    date_iso: "2025-12-01",
    status: "FT",
    league: "Serie A",
    home_team: "Flamengo",
    away_team: "Palmeiras",
    result: "W",
    htResult: "W",
    homeGoalsFt: 2,
    awayGoalsFt: 1,
    homeGoalsHt: 1,
    awayGoalsHt: 0,
    homeYellows: 0,
    awayYellows: 0,
    homeReds: 0,
    awayReds: 0,
    homeYellowReds: 0,
    awayYellowReds: 0,
    homeBookingPoints: 0,
    awayBookingPoints: 0,
    homeTotalShots: 0,
    awayTotalShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homeCorners: 0,
    awayCorners: 0,
    homeCorners1h: null,
    awayCorners1h: null,
    homeCorners2h: null,
    awayCorners2h: null,
    homeFouls: 0,
    awayFouls: 0,
    homeOffsides: 0,
    awayOffsides: 0,
    homeTackles: 0,
    awayTackles: 0,
    ...over,
  };
}

describe("<H2H />", () => {
  it("renders fallback when matches is empty", () => {
    render(<H2H matches={[]} homeTeam="Flamengo" awayTeam="Palmeiras" />);
    expect(screen.getByText(/nenhum confronto direto/i)).toBeDefined();
  });

  it("renders one timeline card per match (up to 5)", () => {
    const matches = [
      match({ id: 1 }),
      match({ id: 2, homeGoalsFt: 0, awayGoalsFt: 0 }),
      match({ id: 3, homeGoalsFt: 1, awayGoalsFt: 3 }),
      match({ id: 4 }),
      match({ id: 5 }),
      match({ id: 6 }),
    ];
    const { container } = render(
      <H2H matches={matches} homeTeam="Flamengo" awayTeam="Palmeiras" />,
    );
    const cards = container.querySelectorAll("[data-h2h-card]");
    // capped at 5
    expect(cards.length).toBe(5);
  });

  it("aggregates home wins / draws / away wins", () => {
    const matches = [
      match({ homeGoalsFt: 2, awayGoalsFt: 1 }), // home win
      match({ homeGoalsFt: 0, awayGoalsFt: 0 }), // draw
      match({ homeGoalsFt: 1, awayGoalsFt: 3 }), // away win
      match({ homeGoalsFt: 1, awayGoalsFt: 1 }), // draw
    ];
    render(<H2H matches={matches} homeTeam="Flamengo" awayTeam="Palmeiras" />);
    const agg = screen.getByTestId("h2h-aggregate");
    // Format: "1-2-1" => home wins 1, draws 2, away wins 1
    expect(agg.textContent).toMatch(/1.*2.*1/);
  });

  it("counts BTTS occurrences", () => {
    const matches = [
      match({ homeGoalsFt: 2, awayGoalsFt: 1 }), // BTTS yes
      match({ homeGoalsFt: 0, awayGoalsFt: 0 }), // no
      match({ homeGoalsFt: 1, awayGoalsFt: 3 }), // BTTS yes
    ];
    render(<H2H matches={matches} homeTeam="Flamengo" awayTeam="Palmeiras" />);
    expect(screen.getByTestId("h2h-btts")).toBeDefined();
    expect(screen.getByTestId("h2h-btts").textContent).toMatch(/2/);
  });

  it("renders score strings (e.g. 2-1) on each card", () => {
    render(
      <H2H
        matches={[match({ homeGoalsFt: 2, awayGoalsFt: 1 })]}
        homeTeam="Flamengo"
        awayTeam="Palmeiras"
      />,
    );
    expect(screen.getByText(/2.*1/)).toBeDefined();
  });
});
