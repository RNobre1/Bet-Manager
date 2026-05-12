import { describe, it, expect } from "vitest";
import {
  todayBrt,
  parseDateParam,
  brtDayWindowUtc,
  toIsoUtc,
  trimKoTime,
  formatUtcAsBrt,
} from "./time";

describe("todayBrt", () => {
  it("returns the BRT date for a UTC instant in the same day", () => {
    // 15:00 UTC on 2026-05-12 = 12:00 BRT on 2026-05-12
    expect(todayBrt(new Date("2026-05-12T15:00:00Z"))).toBe("2026-05-12");
  });

  it("rolls back to the previous day when UTC is between 00:00-02:59", () => {
    // 02:00 UTC on 2026-05-12 = 23:00 BRT on 2026-05-11
    expect(todayBrt(new Date("2026-05-12T02:00:00Z"))).toBe("2026-05-11");
  });

  it("flips to the next day right at 03:00 UTC", () => {
    expect(todayBrt(new Date("2026-05-12T03:00:00Z"))).toBe("2026-05-12");
  });
});

describe("parseDateParam", () => {
  const now = new Date("2026-05-12T15:00:00Z");

  it("resolves 'today' to the current BRT date", () => {
    expect(parseDateParam("today", now)).toBe("2026-05-12");
  });

  it("resolves 'tomorrow' to BRT+1", () => {
    expect(parseDateParam("tomorrow", now)).toBe("2026-05-13");
  });

  it("accepts ISO-8601 YYYY-MM-DD", () => {
    expect(parseDateParam("2026-05-12", now)).toBe("2026-05-12");
  });

  it("rejects malformed input", () => {
    expect(parseDateParam("12/05/2026", now)).toBeNull();
    expect(parseDateParam("not-a-date", now)).toBeNull();
    expect(parseDateParam("", now)).toBeNull();
    expect(parseDateParam(null, now)).toBeNull();
  });

  it("rejects ISO dates with impossible components", () => {
    expect(parseDateParam("2026-13-01", now)).toBeNull(); // month 13
    expect(parseDateParam("2026-02-30", now)).toBeNull(); // Feb 30
  });
});

describe("brtDayWindowUtc", () => {
  it("returns [date 03:00 UTC, (date+1) 03:00 UTC) for a BRT day", () => {
    expect(brtDayWindowUtc("2026-05-12")).toEqual({
      startUtc: "2026-05-12T03:00:00.000Z",
      endUtc: "2026-05-13T03:00:00.000Z",
    });
  });

  it("handles month boundary correctly", () => {
    expect(brtDayWindowUtc("2026-05-31")).toEqual({
      startUtc: "2026-05-31T03:00:00.000Z",
      endUtc: "2026-06-01T03:00:00.000Z",
    });
  });
});

describe("toIsoUtc", () => {
  it("normalises any offset to UTC Z", () => {
    expect(toIsoUtc("2026-05-12T20:30:00+00:00")).toBe("2026-05-12T20:30:00Z");
    expect(toIsoUtc("2026-05-12T17:30:00-03:00")).toBe("2026-05-12T20:30:00Z");
  });

  it("returns null for empty / invalid input", () => {
    expect(toIsoUtc(null)).toBeNull();
    expect(toIsoUtc(undefined)).toBeNull();
    expect(toIsoUtc("")).toBeNull();
    expect(toIsoUtc("garbage")).toBeNull();
  });
});

describe("trimKoTime", () => {
  it("trims HH:MM:SS to HH:MM", () => {
    expect(trimKoTime("21:30:00")).toBe("21:30");
  });

  it("passes HH:MM through unchanged", () => {
    expect(trimKoTime("21:30")).toBe("21:30");
  });

  it("returns null for empty / null input", () => {
    expect(trimKoTime(null)).toBeNull();
    expect(trimKoTime(undefined)).toBeNull();
    expect(trimKoTime("")).toBeNull();
  });
});

describe("formatUtcAsBrt", () => {
  it("converts a UTC instant to HH:MM in BRT (UTC-3, no DST)", () => {
    // 23:30 UTC → 20:30 BRT
    expect(formatUtcAsBrt("2026-05-12T23:30:00Z")).toBe("20:30");
  });

  it("handles cross-midnight conversion (early-morning UTC = previous day BRT)", () => {
    // 00:30 UTC on 13th = 21:30 BRT on 12th — formatter still emits HH:MM
    expect(formatUtcAsBrt("2026-05-13T00:30:00Z")).toBe("21:30");
  });

  it("returns null for null / empty / invalid input", () => {
    expect(formatUtcAsBrt(null)).toBeNull();
    expect(formatUtcAsBrt(undefined)).toBeNull();
    expect(formatUtcAsBrt("")).toBeNull();
    expect(formatUtcAsBrt("garbage")).toBeNull();
  });
});
