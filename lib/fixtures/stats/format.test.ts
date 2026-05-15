import { describe, it, expect } from "vitest";
import { fmtNum, fmtInt, fmtPct, fmtSigned } from "./format";

describe("fmtNum", () => {
  it("rounds to 2 decimals, trims trailing zeros", () => {
    expect(fmtNum(0.4525455688246386)).toBe("0.45");
    expect(fmtNum(2)).toBe("2");
    expect(fmtNum(1.5)).toBe("1.5");
  });
  it("returns em-dash for null/undefined/NaN", () => {
    expect(fmtNum(null)).toBe("—");
    expect(fmtNum(undefined)).toBe("—");
    expect(fmtNum(NaN)).toBe("—");
  });
});
describe("fmtInt", () => {
  it("groups thousands with a dot (pt-BR)", () => {
    expect(fmtInt(1591)).toBe("1.591");
    expect(fmtInt(13)).toBe("13");
  });
  it("em-dash for null", () => {
    expect(fmtInt(null)).toBe("—");
  });
});
describe("fmtPct", () => {
  it("renders 0..1 as integer percent", () => {
    expect(fmtPct(0.73)).toBe("73%");
    expect(fmtPct(1)).toBe("100%");
  });
  it("accepts already-percent when >1 via raw flag", () => {
    expect(fmtPct(73, { raw: true })).toBe("73%");
  });
});
describe("fmtSigned", () => {
  it("prefixes + for positive", () => {
    expect(fmtSigned(0.88)).toBe("+0.88");
    expect(fmtSigned(-0.4)).toBe("-0.4");
  });
});
