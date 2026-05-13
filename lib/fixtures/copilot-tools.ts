import { computeBadges, type Badge } from "./badges";
import {
  brtDayWindowUtc,
  formatUtcAsBrt,
  parseDateParam,
  todayBrt,
} from "./time";

/**
 * Tool the LLM can invoke to pull a compact, filtered view of the fixtures
 * for a given BRT day. Output is kept terse on purpose — every byte we ship
 * back to the model is billed and crowds out the answer.
 *
 * Filters honored:
 *   - date: "today" | "tomorrow" | "YYYY-MM-DD" (defaults to today BRT)
 *   - league_substr: case-insensitive substring match on `league`
 *   - country: case-insensitive equality on the slug
 *   - only_with_badge: keep only fixtures whose computed Badges include id
 *   - min_referee_booking: min avg_total_booking_points of the referee
 *   - limit: 1..50 (default 50)
 *
 * Returns:
 *   {
 *     date: "YYYY-MM-DD",
 *     total: <count after filters>,
 *     fixtures: [
 *       { id, home_team, away_team, league, country, kickoff_brt,
 *         badges?, referee_avg_booking?, has_detail }
 *     ]
 *   }
 */

export type BadgeId =
  | "cartao-alto"
  | "over-alto"
  | "btts-alto"
  | "primeiro-tempo";

export interface QueryFixturesArgs {
  date?: string;
  league_substr?: string;
  country?: string;
  only_with_badge?: BadgeId;
  min_referee_booking?: number;
  limit?: number;
}

export interface CompactFixture {
  id: number;
  home_team: string;
  away_team: string;
  league: string | null;
  country: string | null;
  kickoff_brt: string | null;
  has_detail: boolean;
  badges?: Badge[];
  referee_avg_booking?: number;
}

export interface QueryFixturesResult {
  date: string;
  total: number;
  fixtures: CompactFixture[];
}

const FIXTURE_COLUMNS =
  "id, match_date, ko_time, home_team, away_team, league, country, source_url, detail_json, kickoff_utc";

const MAX_LIMIT = 50;

export const QUERY_FIXTURES_TOOL = {
  type: "function" as const,
  function: {
    name: "query_fixtures",
    description:
      "Lista fixtures de futebol de um dia (BRT) com filtros opcionais. Use pra responder perguntas sobre os jogos disponíveis, cartões, gols, BTTS, 1º tempo, etc.",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "'today' (default), 'tomorrow', ou data ISO YYYY-MM-DD. Sempre BRT.",
        },
        league_substr: {
          type: "string",
          description:
            "Filtra ligas cujo nome contenha esse substring (case-insensitive). Ex: 'Premier' pega 'Premier League'.",
        },
        country: {
          type: "string",
          description:
            "Filtra por slug de país (case-insensitive). Ex: 'brazil', 'england', 'spain'.",
        },
        only_with_badge: {
          type: "string",
          enum: [
            "cartao-alto",
            "over-alto",
            "btts-alto",
            "primeiro-tempo",
          ],
          description:
            "Mantém apenas fixtures com esse badge computado: 'cartao-alto' (árbitro/elenco com muitos cartões), 'over-alto' (ambos com sequência Over 2.5≥70%), 'btts-alto' (ambos com BTTS≥70%), 'primeiro-tempo' (ambos com gols no 1T≥70%).",
        },
        min_referee_booking: {
          type: "number",
          description:
            "Filtra pra árbitros com avg_total_booking_points >= esse valor.",
        },
        limit: {
          type: "number",
          description: "Máximo de fixtures retornadas (1..50, default 50).",
        },
      },
      additionalProperties: false,
    },
  },
};

interface FixtureRowLite {
  id: number;
  match_date: string;
  ko_time: string | null;
  home_team: string;
  away_team: string;
  league: string | null;
  country: string | null;
  source_url: string | null;
  detail_json: unknown;
  kickoff_utc: string | null;
}

interface AdminLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export async function queryFixtures(
  args: QueryFixturesArgs,
  admin: AdminLike,
): Promise<QueryFixturesResult> {
  const date = resolveDate(args.date);
  const { startUtc, endUtc } = brtDayWindowUtc(date);
  const orExpr =
    `and(kickoff_utc.gte.${startUtc},kickoff_utc.lt.${endUtc}),` +
    `and(kickoff_utc.is.null,match_date.eq.${date})`;

  const result = await admin
    .from("fixtures")
    .select(FIXTURE_COLUMNS)
    .or(orExpr)
    .order("kickoff_utc", { ascending: true, nullsFirst: false });

  const data: FixtureRowLite[] = (result?.data ?? []) as FixtureRowLite[];

  const filtered = data.filter((row) => matches(row, args));
  const compact = filtered.map(toCompact);
  const limit = clampLimit(args.limit);
  const trimmed = compact.slice(0, limit);

  return {
    date,
    total: compact.length,
    fixtures: trimmed,
  };
}

function resolveDate(input: string | undefined): string {
  if (!input) return todayBrt();
  const parsed = parseDateParam(input);
  return parsed ?? todayBrt();
}

function clampLimit(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return MAX_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(input)));
}

function matches(row: FixtureRowLite, args: QueryFixturesArgs): boolean {
  if (args.country) {
    const target = args.country.toLowerCase();
    if ((row.country ?? "").toLowerCase() !== target) return false;
  }
  if (args.league_substr) {
    const needle = args.league_substr.toLowerCase();
    if (!(row.league ?? "").toLowerCase().includes(needle)) return false;
  }
  const badges = computeBadges(row.detail_json);
  if (args.only_with_badge) {
    if (!badges.some((b) => b.id === args.only_with_badge)) return false;
  }
  if (typeof args.min_referee_booking === "number") {
    const v = readRefereeAvgBooking(row.detail_json);
    if (v === null || v < args.min_referee_booking) return false;
  }
  return true;
}

function toCompact(row: FixtureRowLite): CompactFixture {
  const badges = computeBadges(row.detail_json);
  const refAvg = readRefereeAvgBooking(row.detail_json);
  const compact: CompactFixture = {
    id: row.id,
    home_team: row.home_team,
    away_team: row.away_team,
    league: row.league,
    country: row.country,
    kickoff_brt: formatUtcAsBrt(row.kickoff_utc),
    has_detail: row.detail_json !== null && row.detail_json !== undefined,
  };
  if (badges.length > 0) compact.badges = badges;
  if (refAvg !== null) compact.referee_avg_booking = refAvg;
  return compact;
}

function readRefereeAvgBooking(detail: unknown): number | null {
  if (!detail || typeof detail !== "object") return null;
  const rec = (detail as Record<string, unknown>).referee_record;
  if (!rec || typeof rec !== "object") return null;
  const v = (rec as Record<string, unknown>).avg_total_booking_points;
  return typeof v === "number" ? v : null;
}
