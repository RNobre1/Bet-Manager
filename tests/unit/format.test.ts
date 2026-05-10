import { describe, expect, it } from "vitest";
import { fmt } from "@/lib/format";

describe("fmt", () => {
  it("formats currency in BRL with pt-BR locale", () => {
    expect(fmt.currency(1234.5)).toMatch(/R\$\s?1\.234,50/);
  });

  it("formats percent with 2 decimals (input is decimal fraction)", () => {
    expect(fmt.percent(0.0842)).toBe("8,42%");
  });

  it("signs positives and zeros", () => {
    expect(fmt.signed(1.5)).toBe("+1,50");
    expect(fmt.signed(0)).toBe("+0,00");
    expect(fmt.signed(-1.5)).toBe("-1,50");
  });
});
