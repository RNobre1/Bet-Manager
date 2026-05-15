import { describe, it, expect } from "vitest";
import {
  readCorrelation,
  readTrend,
  readOutlier,
  readScatterPair,
} from "./readings";

describe("readCorrelation", () => {
  it("forte positiva → título + leitura acionável", () => {
    const r = readCorrelation("sot_for", "goals_ft_for", 0.88);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.text).toContain("0.88");
    expect(r.text.toLowerCase()).toContain("mercado");
  });
});
describe("readTrend", () => {
  it("queda → menciona direção e cautela", () => {
    const r = readTrend("goals_ft_for", -0.4);
    expect(r.text).toContain("-0.4");
    expect(r.title.toLowerCase()).toMatch(/queda|cai/);
  });
});
describe("readOutlier", () => {
  it("cita valor e média", () => {
    const r = readOutlier("corners_for", 8, 2.1);
    expect(r.text).toContain("8");
    expect(r.text).toContain("2.1");
  });
});
describe("readScatterPair", () => {
  it("fraco → diz pouco preditivo", () => {
    const s = readScatterPair("sot_for", "goals_ft_for", 0.38);
    expect(s.toLowerCase()).toContain("fraca");
  });
});
