import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FixturesList } from "@/components/fixtures/fixtures-list";
import type { FixtureDTO } from "@/lib/fixtures/types";

function fx(over: Partial<FixtureDTO> & { id: number }): FixtureDTO {
  return {
    id: over.id,
    match_date: over.match_date ?? "2026-05-12",
    ko_time: over.ko_time ?? "20:00",
    home_team: over.home_team ?? "Home",
    away_team: over.away_team ?? "Away",
    league: over.league ?? null,
    country: over.country ?? null,
    source_url: over.source_url ?? null,
    has_detail: over.has_detail ?? true,
    kickoff_utc: over.kickoff_utc ?? null,
  };
}

describe("<FixturesList />", () => {
  it("renders one section per league|country with the count and items", () => {
    render(
      <FixturesList
        fixtures={[
          fx({
            id: 1,
            league: "Premier League",
            country: "england",
            home_team: "Arsenal",
            away_team: "Tottenham",
          }),
          fx({
            id: 2,
            league: "Premier League",
            country: "ukraine",
            home_team: "Shakhtar",
            away_team: "Dynamo",
          }),
        ]}
      />,
    );

    // Two distinct headers — same league name, disambiguated by country.
    const headers = screen.getAllByRole("heading", { level: 3 });
    expect(headers).toHaveLength(2);
    // Both teams are visible somewhere
    expect(screen.getByText("Arsenal")).toBeDefined();
    expect(screen.getByText("Shakhtar")).toBeDefined();
  });

  it("renders the empty state when there are no fixtures", () => {
    render(<FixturesList fixtures={[]} />);
    expect(screen.getByText(/sem jogos/i)).toBeDefined();
  });
});
