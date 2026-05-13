import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUtcAsBrt, toIsoUtc, trimKoTime } from "@/lib/fixtures/time";
import type { FixtureRow } from "@/lib/fixtures/types";
import type {
  DetailJson,
  OddsMarket,
  OddsSummary,
  RefereeRecord,
} from "@/lib/fixtures/stats/detail-json-types";
import { StatsLayout } from "@/components/fixtures/stats/stats-layout";
import { Hero, type HeroKpiBundle } from "@/components/fixtures/stats/hero";

export const dynamic = "force-dynamic";

const FIXTURE_COLUMNS =
  "id, match_date, ko_time, home_team, away_team, league, country, source_url, detail_json, kickoff_utc";

interface StatsPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Picks a decimal odd from a market by trying a list of candidate keys.
 * Tolerant: returns null when the market is missing or no candidate matched.
 */
function pickOdd(market: OddsMarket | undefined, keys: string[]): number | null {
  if (!market) return null;
  for (const k of keys) {
    const outcome = market[k];
    if (outcome && typeof outcome.decimal_odds === "number") {
      return outcome.decimal_odds;
    }
  }
  // Fallback — case-insensitive contains for fuzzy team-name matches.
  const entries = Object.entries(market);
  for (const candidate of keys) {
    const needle = candidate.toLowerCase();
    const hit = entries.find(
      ([name]) => name.toLowerCase().includes(needle) && needle.length >= 3,
    );
    if (hit && typeof hit[1].decimal_odds === "number") {
      return hit[1].decimal_odds;
    }
  }
  return null;
}

/**
 * Finds the Result market entry for the home team. Real choistats payloads
 * key by long team names (e.g. "Tottenham Hotspur" while fixtures.home_team
 * is "Tottenham"), so we accept either an exact match or the first non-Draw
 * key as fallback.
 */
function pickResultOdds(
  market: OddsMarket | undefined,
  homeTeam: string,
  awayTeam: string,
): { home: number | null; draw: number | null; away: number | null } {
  if (!market) return { home: null, draw: null, away: null };

  const direct = (key: string): number | null => {
    const o = market[key];
    return o && typeof o.decimal_odds === "number" ? o.decimal_odds : null;
  };

  const draw = direct("Draw");

  const nonDraw = Object.entries(market).filter(
    ([k]) => k.toLowerCase() !== "draw",
  );

  const matchByContains = (team: string): number | null => {
    const needle = team.toLowerCase();
    const hit = nonDraw.find(
      ([name]) =>
        name.toLowerCase().includes(needle) ||
        needle.includes(name.toLowerCase()),
    );
    return hit && typeof hit[1].decimal_odds === "number"
      ? hit[1].decimal_odds
      : null;
  };

  let home = matchByContains(homeTeam);
  let away = matchByContains(awayTeam);

  // If we couldn't tag by name, fall back to positional (1st non-Draw = home).
  if (home === null && nonDraw.length >= 1) {
    const o = nonDraw[0][1];
    if (typeof o.decimal_odds === "number") home = o.decimal_odds;
  }
  if (away === null && nonDraw.length >= 2) {
    const o = nonDraw[1][1];
    if (typeof o.decimal_odds === "number") away = o.decimal_odds;
  }

  return { home, draw, away };
}

function deriveHeroKpis(
  detail: DetailJson | null,
  homeTeam: string,
  awayTeam: string,
): HeroKpiBundle | null {
  if (!detail) return null;

  const odds = (detail.odds_summary ?? {}) as OddsSummary;
  const result = odds["Result"] as OddsMarket | undefined;
  const goals = odds["Match Goals Overs/Unders"] as OddsMarket | undefined;
  const btts = odds["BTTS"] as OddsMarket | undefined;
  const ref = (detail.referee_record ?? null) as RefereeRecord | null;

  const { home: home_odd, draw: draw_odd, away: away_odd } = pickResultOdds(
    result,
    homeTeam,
    awayTeam,
  );

  return {
    home_odd,
    draw_odd,
    away_odd,
    over25_odd: pickOdd(goals, ["Over 2.5"]),
    btts_yes_odd: pickOdd(btts, ["Yes"]),
    ref_avg_bp:
      ref && typeof ref.avg_total_booking_points === "number"
        ? ref.avg_total_booking_points
        : null,
  };
}

export default async function StatsPage({ params }: StatsPageProps) {
  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) notFound();
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const admin = createAdminClient();
  // The `fixtures` table is not reflected in the generated Database type
  // yet — same escape hatch as app/(dashboard)/fixtures/[id]/page.tsx.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = admin as unknown as { from: (t: string) => any };
  const { data, error } = await untyped
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`failed to load fixture ${id}: ${error.message}`);
  }
  if (!data) {
    notFound();
  }

  const row = data as FixtureRow;
  const detail = (row.detail_json ?? null) as DetailJson | null;

  const kickoffIso = toIsoUtc(row.kickoff_utc);
  const kickoffBrt =
    formatUtcAsBrt(kickoffIso) ?? trimKoTime(row.ko_time) ?? null;

  const kpis = deriveHeroKpis(detail, row.home_team, row.away_team);

  return (
    <StatsLayout
      fixtureId={row.id}
      hero={
        <Hero
          homeTeam={row.home_team}
          awayTeam={row.away_team}
          kickoffBrt={kickoffBrt}
          league={row.league}
          country={row.country}
          kpis={kpis}
        />
      }
      panels={[]}
    />
  );
}
