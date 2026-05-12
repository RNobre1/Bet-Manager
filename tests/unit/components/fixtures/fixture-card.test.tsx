import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FixtureCard } from "@/components/fixtures/fixture-card";
import type { FixtureDTO } from "@/lib/fixtures/types";

function fx(over: Partial<FixtureDTO> & { id: number }): FixtureDTO {
  // Use `in` checks so explicit `null` overrides are honored — `?? default`
  // would silently replace the test's `null` with the factory default.
  return {
    id: over.id,
    match_date: "match_date" in over ? over.match_date! : "2026-05-12",
    ko_time: "ko_time" in over ? over.ko_time! : "20:00",
    home_team: "home_team" in over ? over.home_team! : "Flamengo",
    away_team: "away_team" in over ? over.away_team! : "Palmeiras",
    league: "league" in over ? over.league! : "Serie A",
    country: "country" in over ? over.country! : "brazil",
    source_url: "source_url" in over ? over.source_url! : null,
    has_detail: "has_detail" in over ? over.has_detail! : true,
    kickoff_utc:
      "kickoff_utc" in over ? over.kickoff_utc! : "2026-05-12T23:00:00Z",
  };
}

describe("<FixtureCard />", () => {
  it("renders home, away, and BRT-formatted kickoff time", () => {
    render(<FixtureCard fixture={fx({ id: 1 })} />);
    expect(screen.getByText("Flamengo")).toBeDefined();
    expect(screen.getByText("Palmeiras")).toBeDefined();
    // 23:00 UTC → 20:00 BRT
    expect(screen.getByText("20:00")).toBeDefined();
  });

  it("renders the OFF badge when has_detail is false", () => {
    render(<FixtureCard fixture={fx({ id: 1, has_detail: false })} />);
    expect(screen.getByText("OFF")).toBeDefined();
  });

  it("does NOT render the OFF badge when has_detail is true", () => {
    render(<FixtureCard fixture={fx({ id: 1, has_detail: true })} />);
    expect(screen.queryByText("OFF")).toBeNull();
  });

  it("wraps the row in a link pointing at /fixtures/[id]", () => {
    render(<FixtureCard fixture={fx({ id: 42 })} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/fixtures/42");
  });

  it("falls back to ko_time when kickoff_utc is null", () => {
    render(
      <FixtureCard fixture={fx({ id: 1, kickoff_utc: null, ko_time: "15:30" })} />,
    );
    expect(screen.getByText("15:30")).toBeDefined();
  });
});
