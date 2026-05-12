import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "./prompt-builder";
import type { FixtureRow } from "./types";

function fixture(detail: Record<string, unknown>): FixtureRow {
  return {
    id: 1,
    match_date: "2026-05-12",
    ko_time: "21:30",
    home_team: "Botafogo",
    away_team: "Flamengo",
    league: "Brasileirão Série A",
    country: "brazil",
    source_url: "/fixture/1",
    detail_json: detail,
    kickoff_utc: "2026-05-13T00:30:00Z",
  };
}

describe("buildSystemPrompt — player_stats", () => {
  it("emits an elenco line with players_count + goals + assists per side", () => {
    const out = buildSystemPrompt(
      fixture({
        player_stats: {
          home: {
            aggregates: {
              players_count: 25,
              goals: 47,
              assists: 32,
              minutes: 32764,
              yellows: 65,
              reds: 1,
              total_shots: 319,
              shots_on_target: 130,
              tackles: 493,
              fouls_committed: 394,
              offsides: 65,
              goals_1h: 17,
              goals_2h: 30,
            },
            top_players: [],
          },
          away: {
            aggregates: {
              players_count: 26,
              goals: 40,
              assists: 26,
            },
            top_players: [],
          },
        },
      }),
    );
    expect(out).toContain("Jogadores e elenco:");
    expect(out).toContain("Botafogo:");
    expect(out).toContain("25 jogadores");
    expect(out).toContain("47G");
    expect(out).toContain("32A");
    expect(out).toContain("Flamengo:");
    expect(out).toContain("26 jogadores");
    expect(out).toContain("40G");
  });

  it("lists the top 5 players by minutes with goals/assists/cards/shots + injured flag", () => {
    const out = buildSystemPrompt(
      fixture({
        player_stats: {
          home: {
            aggregates: { players_count: 1 },
            top_players: [
              {
                name: "Igor Jesus",
                played: 30,
                minutes: 2500,
                goals: 14,
                assists: 4,
                yellows: 3,
                reds: 0,
                total_shots: 60,
                shots_on_target: 30,
                injured: false,
              },
              {
                name: "John Doe",
                played: 28,
                minutes: 2200,
                goals: 2,
                assists: 6,
                yellows: 5,
                reds: 1,
                total_shots: 20,
                shots_on_target: 8,
                injured: true,
              },
            ],
          },
          away: { aggregates: {}, top_players: [] },
        },
      }),
    );
    expect(out).toContain("top 2 por minutos:");
    expect(out).toContain("Igor Jesus — 30j 2500min · 14G/4A");
    expect(out).toContain("60 chutes (30 no alvo)");
    expect(out).toContain("John Doe");
    expect(out).toContain("⚠ lesão");
  });

  it("skips player_stats section entirely when both sides are missing", () => {
    const out = buildSystemPrompt(fixture({ player_stats: null }));
    expect(out).not.toContain("Jogadores e elenco:");
  });
});

describe("buildSystemPrompt — referee_record", () => {
  it("emits a line with referee name + completed jogos + avg booking points", () => {
    const out = buildSystemPrompt(
      fixture({
        referee_record: {
          name: "Adrián Cordero Vega",
          fixtures_count: 21,
          completed: 21,
          avg_total_booking_points: 40.95,
          avg_home_booking_points: 17.38,
          avg_away_booking_points: 23.57,
          total_yellow_reds: 0,
        },
      }),
    );
    expect(out).toContain(
      "Árbitro: Adrián Cordero Vega — 21 jogos completos · booking médio total 40.95 · (casa 17.38 / fora 23.57)",
    );
  });

  it("skips when the referee has 0 completed jogos (no signal worth burning tokens)", () => {
    const out = buildSystemPrompt(
      fixture({
        referee_record: {
          name: "Newbie Ref",
          fixtures_count: 0,
          completed: 0,
        },
      }),
    );
    expect(out).not.toContain("Árbitro:");
  });

  it("includes total_yellow_reds when > 0", () => {
    const out = buildSystemPrompt(
      fixture({
        referee_record: {
          name: "Card Man",
          completed: 10,
          avg_total_booking_points: 50,
          total_yellow_reds: 4,
        },
      }),
    );
    expect(out).toContain("4 2ºamarelos");
  });
});

describe("buildSystemPrompt — odds_summary", () => {
  it("includes preferred markets verbatim with decimal odds + bookmaker", () => {
    const out = buildSystemPrompt(
      fixture({
        odds_summary: {
          Result: {
            Botafogo: { decimal_odds: 1.84, bookmaker: "BET365" },
            Draw: { decimal_odds: 3.75, bookmaker: "UNIBET" },
            Flamengo: { decimal_odds: 4.1, bookmaker: "UNIBET" },
          },
          BTTS: {
            Yes: { decimal_odds: 1.7, bookmaker: "UNIBET" },
            No: { decimal_odds: 2.05, bookmaker: "UNIBET" },
          },
        },
      }),
    );
    expect(out).toContain("Odds (melhores por mercado):");
    expect(out).toContain("Result: Botafogo 1.84 (BET365)");
    expect(out).toContain("Draw 3.75 (UNIBET)");
    expect(out).toContain("BTTS: Yes 1.70 (UNIBET) · No 2.05 (UNIBET)");
  });

  it("drops player-prop markets that have > 4 outcomes (To assist, To score, etc.)", () => {
    const out = buildSystemPrompt(
      fixture({
        odds_summary: {
          "To assist": {
            Player1: { decimal_odds: 6.25, bookmaker: "U" },
            Player2: { decimal_odds: 8, bookmaker: "B" },
            Player3: { decimal_odds: 9, bookmaker: "B" },
            Player4: { decimal_odds: 4.1, bookmaker: "U" },
            Player5: { decimal_odds: 3.8, bookmaker: "U" },
            Player6: { decimal_odds: 4.2, bookmaker: "U" },
          },
          Result: {
            Home: { decimal_odds: 1.5, bookmaker: "X" },
            Draw: { decimal_odds: 4, bookmaker: "X" },
            Away: { decimal_odds: 6, bookmaker: "X" },
          },
        },
      }),
    );
    expect(out).toContain("Result: Home 1.50");
    expect(out).not.toContain("To assist");
    expect(out).not.toContain("Player1");
  });

  it("skips outcomes without a numeric decimal_odds", () => {
    const out = buildSystemPrompt(
      fixture({
        odds_summary: {
          Result: {
            Home: { decimal_odds: 1.5, bookmaker: "X" },
            Draw: { bookmaker: "X" },
          },
        },
      }),
    );
    expect(out).toContain("Home 1.50");
    expect(out).not.toContain("Draw 1.50");
  });
});
