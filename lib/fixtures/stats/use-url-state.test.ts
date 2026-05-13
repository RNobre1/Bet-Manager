import { describe, it, expect } from "vitest";
import { commitUrlState } from "./use-url-state";

describe("commitUrlState", () => {
  it("adiciona uma chave nova", () => {
    const out = commitUrlState(
      new URLSearchParams(""),
      { streaks: "BTTS" },
      { min_perc: "60" },
    );
    expect(out).toBe("streaks=BTTS");
  });

  it("remove chave quando valor é null", () => {
    const out = commitUrlState(
      new URLSearchParams("streaks=BTTS&min_perc=70"),
      { streaks: null },
      { min_perc: "60" },
    );
    expect(out).toBe("min_perc=70");
  });

  it("remove chave quando valor é igual ao default", () => {
    const out = commitUrlState(
      new URLSearchParams("min_perc=70"),
      { min_perc: "60" },
      { min_perc: "60" },
    );
    expect(out).toBe("");
  });

  it("remove chave quando valor é string vazia", () => {
    const out = commitUrlState(
      new URLSearchParams("streaks=BTTS"),
      { streaks: "" },
      {},
    );
    expect(out).toBe("");
  });

  it("preserva params que não estão no patch", () => {
    const out = commitUrlState(
      new URLSearchParams("tab=streaks&date=2026-05-13"),
      { streaks: "Goals" },
      {},
    );
    expect(out).toContain("tab=streaks");
    expect(out).toContain("date=2026-05-13");
    expect(out).toContain("streaks=Goals");
  });

  it("aplica múltiplas chaves no mesmo patch", () => {
    const out = commitUrlState(
      new URLSearchParams(""),
      { streaks: "BTTS,Goals", min_perc: "80" },
      { min_perc: "60" },
    );
    const params = new URLSearchParams(out);
    expect(params.get("streaks")).toBe("BTTS,Goals");
    expect(params.get("min_perc")).toBe("80");
  });
});
