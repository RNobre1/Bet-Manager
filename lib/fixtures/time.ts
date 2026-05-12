/**
 * Returns the current date in BRT (America/Sao_Paulo, fixed UTC-3 since
 * Brazil abolished DST in 2019) as "YYYY-MM-DD".
 */
export function todayBrt(now: Date = new Date()): string {
  const utcMs = now.getTime();
  const brtMs = utcMs - 3 * 60 * 60 * 1000;
  const brt = new Date(brtMs);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Parses ?date=today|tomorrow|YYYY-MM-DD into an ISO date string.
 * Returns null when the input is invalid.
 */
export function parseDateParam(
  input: string | null,
  now: Date = new Date(),
): string | null {
  if (!input) return null;
  if (input === "today") return todayBrt(now);
  if (input === "tomorrow") {
    const d = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return todayBrt(d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const parsed = new Date(input + "T00:00:00Z");
    // Reject roll-overs ("2026-02-30" silently becomes "2026-03-02" in JS).
    if (!isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input) {
      return input;
    }
  }
  return null;
}

/**
 * Returns the BRT calendar-day window for `date` as an inclusive-start /
 * exclusive-end pair of ISO-8601 UTC strings.
 *
 * Because BRT = UTC-3, midnight BRT on day D is 03:00 UTC on day D, and
 * midnight BRT on D+1 is 03:00 UTC on D+1.
 */
export function brtDayWindowUtc(date: string): { startUtc: string; endUtc: string } {
  const start = new Date(date + "T03:00:00Z");
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}

/**
 * Normalizes a Postgres timestamptz value (any offset) to ISO-8601 UTC
 * with Z suffix, so the client can do new Date(s) without ambiguity.
 */
export function toIsoUtc(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Trims a Postgres `time` value ("HH:MM:SS") to "HH:MM" for the API.
 */
export function trimKoTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : value;
}
