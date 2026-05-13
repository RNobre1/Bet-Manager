/**
 * Outlier badges computed deterministically from a fixture's `detail_json`.
 *
 * Used by the fixtures list to surface high-signal opportunities at a glance
 * (e.g. "cartão alto" when the referee averages a lot of bookings, "over alto"
 * when both squads have an Over 2.5 streak above 70%). Zero LLM, server-side.
 *
 * Conservative on purpose:
 *   - Streak-based badges require BOTH teams to qualify — single-sided streaks
 *     are noisy and don't earn a place on a tiny card.
 *   - Sample-size gate on the referee (`completed >= 5`) — otherwise a debutant
 *     ref with 1 booking-heavy game would mint a badge that means nothing.
 *   - Cap the output at 3 to keep the card from turning into a Christmas tree.
 */

export type BadgeTone = "cards" | "over" | "btts" | "first-half";

export interface Badge {
  id: string;
  label: string;
  tone: BadgeTone;
}

const MAX_BADGES = 3;
const STREAK_PERC_MIN = 70;
const REFEREE_BOOKING_THRESHOLD = 45;
const REFEREE_2YA_THRESHOLD = 3;
const REFEREE_MIN_COMPLETED = 5;

interface Streak {
  desc?: string;
  stat_type?: string;
  overall_perc?: number;
}

interface RefereeRecord {
  name?: string;
  completed?: number;
  fixtures_count?: number;
  avg_total_booking_points?: number;
  total_yellow_reds?: number;
}

export function computeBadges(detail: unknown): Badge[] {
  if (!isRecord(detail)) return [];

  const out: Badge[] = [];
  const ref = asRecord(detail.referee_record) as RefereeRecord | null;
  const streaks = asRecord(detail.streaks);
  const homeStreaks = (asArray(streaks?.home) as unknown[]) as Streak[];
  const awayStreaks = (asArray(streaks?.away) as unknown[]) as Streak[];

  if (refereeIsHighCards(ref)) {
    out.push({ id: "cartao-alto", label: "cartão alto", tone: "cards" });
  }

  if (bothSidesMatch(homeStreaks, awayStreaks, isOver25Streak)) {
    out.push({ id: "over-alto", label: "over alto", tone: "over" });
  }

  if (bothSidesMatch(homeStreaks, awayStreaks, isBttsStreak)) {
    out.push({ id: "btts-alto", label: "btts alto", tone: "btts" });
  }

  if (bothSidesMatch(homeStreaks, awayStreaks, isFirstHalfStreak)) {
    out.push({
      id: "primeiro-tempo",
      label: "1T quente",
      tone: "first-half",
    });
  }

  return out.slice(0, MAX_BADGES);
}

function refereeIsHighCards(ref: RefereeRecord | null): boolean {
  if (!ref) return false;
  const completed = ref.completed ?? ref.fixtures_count ?? 0;
  if (completed < REFEREE_MIN_COMPLETED) return false;
  if (
    typeof ref.avg_total_booking_points === "number" &&
    ref.avg_total_booking_points > REFEREE_BOOKING_THRESHOLD
  ) {
    return true;
  }
  if (
    typeof ref.total_yellow_reds === "number" &&
    ref.total_yellow_reds >= REFEREE_2YA_THRESHOLD
  ) {
    return true;
  }
  return false;
}

function bothSidesMatch(
  home: Streak[],
  away: Streak[],
  predicate: (s: Streak) => boolean,
): boolean {
  return home.some(predicate) && away.some(predicate);
}

function streakText(s: Streak): string {
  return `${s.stat_type ?? ""} ${s.desc ?? ""}`.toLowerCase();
}

function streakStrong(s: Streak): boolean {
  return typeof s.overall_perc === "number" && s.overall_perc >= STREAK_PERC_MIN;
}

function isOver25Streak(s: Streak): boolean {
  if (!streakStrong(s)) return false;
  const t = streakText(s);
  return t.includes("over 2.5");
}

function isBttsStreak(s: Streak): boolean {
  if (!streakStrong(s)) return false;
  const t = streakText(s);
  return t.includes("btts") || t.includes("both teams");
}

function isFirstHalfStreak(s: Streak): boolean {
  if (!streakStrong(s)) return false;
  const t = streakText(s);
  return t.includes("1h ") || t.includes("first half") || t.includes("1st half");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return isRecord(v) ? v : null;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
