import { describe, it, expect } from "vitest";
import { computeRoi, computeYield, computeWinRate, computeMaxDrawdown, carryForwardSeries, computeStreaks } from "./metrics";

describe("computeRoi", () => {
  it("cumulativePl / netCapital", () => {
    expect(computeRoi({ cumulativePl: 150, netCapital: 1000 })).toBeCloseTo(0.15);
  });
  it("netCapital 0 → null (sem divisão por zero)", () => {
    expect(computeRoi({ cumulativePl: 10, netCapital: 0 })).toBeNull();
  });
  it("netCapital negativo (saques > depósitos) → null, paridade com `> 0` original (consumidor ?? 0 → exibe 0)", () => {
    // Dashboard original: `roi = netCapital > 0 ? cumulativePl/netCapital : 0`
    // computeRoi retorna null; consumidor usa `?? 0` → mesmo resultado.
    expect(computeRoi({ cumulativePl: 50, netCapital: -200 })).toBeNull();
  });
});

describe("computeYield", () => {
  it("(returned - staked) / staked", () => {
    expect(computeYield({ resolvedReturned: 1100, resolvedStaked: 1000 })).toBeCloseTo(0.1);
  });
  it("staked 0 → null", () => {
    expect(computeYield({ resolvedReturned: 0, resolvedStaked: 0 })).toBeNull();
  });
  it("resolvedStaked negativo → null, paridade com `> 0` original (consumidor ?? 0 → exibe 0)", () => {
    // Dashboard original: `yield = resolvedStaked > 0 ? ... : 0`
    // computeYield retorna null; consumidor usa `?? 0` → mesmo resultado.
    expect(computeYield({ resolvedReturned: 0, resolvedStaked: -50 })).toBeNull();
  });
});

describe("computeWinRate", () => {
  it("won / (won + lost) — void não conta", () => {
    expect(computeWinRate({ won: 6, lost: 4 })).toBeCloseTo(0.6);
  });
  it("nenhuma resolvida → null", () => {
    expect(computeWinRate({ won: 0, lost: 0 })).toBeNull();
  });
});

describe("computeMaxDrawdown", () => {
  it("maior queda pico→vale numa série de P/L acumulado", () => {
    expect(computeMaxDrawdown([0, 100, 60, 120, 50, 130])).toBeCloseTo(70); // pico 120 → vale 50
  });
  it("série sempre crescente → 0", () => {
    expect(computeMaxDrawdown([0, 10, 20, 30])).toBe(0);
  });
  it("série vazia → 0", () => {
    expect(computeMaxDrawdown([])).toBe(0);
  });
});

describe("computeStreaks", () => {
  it("sequência corrente de vitórias (mais recente primeiro)", () => {
    const result = computeStreaks(["W", "W", "L", "W"]);
    expect(result.currentWinStreak).toBe(2);
    expect(result.currentLoseStreak).toBe(0);
  });

  it("sequência corrente de derrotas (mais recente primeiro)", () => {
    const result = computeStreaks(["L", "L", "W", "W"]);
    expect(result.currentWinStreak).toBe(0);
    expect(result.currentLoseStreak).toBe(2);
  });

  it("max win streak considera toda a série", () => {
    const result = computeStreaks(["W", "L", "W", "W", "W", "L"]);
    expect(result.maxWinStreak).toBe(3);
  });

  it("max lose streak considera toda a série", () => {
    const result = computeStreaks(["W", "L", "L", "L", "W"]);
    expect(result.maxLoseStreak).toBe(3);
  });

  it("série vazia → todos zeros", () => {
    const result = computeStreaks([]);
    expect(result.currentWinStreak).toBe(0);
    expect(result.currentLoseStreak).toBe(0);
    expect(result.maxWinStreak).toBe(0);
    expect(result.maxLoseStreak).toBe(0);
  });
});

describe("carryForwardSeries", () => {
  it("preenche dias sem snapshot com o último saldo conhecido", () => {
    const input = [
      { date: "2026-05-01", balance: 100 },
      { date: "2026-05-04", balance: 130 },
    ];
    const out = carryForwardSeries(input, "2026-05-01", "2026-05-05");
    expect(out).toEqual([
      { date: "2026-05-01", balance: 100 },
      { date: "2026-05-02", balance: 100 },
      { date: "2026-05-03", balance: 100 },
      { date: "2026-05-04", balance: 130 },
      { date: "2026-05-05", balance: 130 },
    ]);
  });
  it("série vazia → array vazio", () => {
    expect(carryForwardSeries([], "2026-05-01", "2026-05-03")).toEqual([]);
  });
});
