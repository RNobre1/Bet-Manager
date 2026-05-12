import type { SupabaseClient } from "@supabase/supabase-js";
import { brtDayWindowUtc, toIsoUtc, trimKoTime } from "./time";
import type { FixtureDTO, FixtureRow } from "./types";

const FIXTURE_COLUMNS =
  "id, match_date, ko_time, home_team, away_team, league, country, source_url, detail_json, kickoff_utc";

/**
 * Returns the fixtures whose kickoff falls inside the BRT calendar day `date`,
 * matching the port of the Ruby `AdamStats::API::DBRepository.fixtures_for`.
 *
 * The Supabase client is taken as a dependency so unit tests can substitute a
 * mock and so the route handler controls when the admin client is constructed.
 *
 * Rows are sorted in JS (kickoff_utc asc nulls last, ko_time asc nulls last,
 * id asc) so the result is deterministic regardless of how the underlying
 * Postgres NULLS LAST surfaces through PostgREST.
 */
export async function fixturesForBrtDay(
  date: string,
  // Loose type so test mocks don't need to satisfy the full SupabaseClient API.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any> | any,
): Promise<FixtureDTO[]> {
  const { startUtc, endUtc } = brtDayWindowUtc(date);

  // PostgREST OR: (kickoff_utc >= start AND kickoff_utc < end) OR (kickoff_utc IS NULL AND match_date = date)
  // The `gte`/`lt` filters already exclude NULLs, so we don't repeat `not.is.null`.
  const orExpr =
    `and(kickoff_utc.gte.${startUtc},kickoff_utc.lt.${endUtc}),` +
    `and(kickoff_utc.is.null,match_date.eq.${date})`;

  const { data, error } = await supabase
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .or(orExpr)
    .order("kickoff_utc", { ascending: true, nullsFirst: false })
    .order("ko_time", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message ?? "supabase query failed");
  }

  const rows = (data ?? []) as FixtureRow[];
  const sorted = [...rows].sort(compareFixtures);
  return sorted.map(toDto);
}

function compareFixtures(a: FixtureRow, b: FixtureRow): number {
  // 1) kickoff_utc ascending, nulls last
  const kAuOrder = compareNullableString(a.kickoff_utc, b.kickoff_utc);
  if (kAuOrder !== 0) return kAuOrder;

  // 2) ko_time ascending, nulls last
  const koOrder = compareNullableString(a.ko_time, b.ko_time);
  if (koOrder !== 0) return koOrder;

  // 3) id ascending
  return a.id - b.id;
}

function compareNullableString(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // nulls last
  if (b === null) return -1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toDto(row: FixtureRow): FixtureDTO {
  return {
    id: row.id,
    match_date: row.match_date,
    ko_time: trimKoTime(row.ko_time),
    home_team: row.home_team,
    away_team: row.away_team,
    league: row.league,
    country: row.country,
    source_url: row.source_url,
    has_detail: row.detail_json !== null && row.detail_json !== undefined,
    kickoff_utc: toIsoUtc(row.kickoff_utc),
  };
}
