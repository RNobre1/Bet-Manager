import { describe, it, expect } from "vitest";
import { fitIsotonic, applyIsotonic } from "@/lib/calibracao/isotonic";

describe("fitIsotonic — Pool Adjacent Violators", () => {
  it("dataset trivial (já monotônico) preserva valores", () => {
    const pairs: Array<[number, number]> = [[0.1, 0.1], [0.3, 0.3], [0.5, 0.5], [0.7, 0.7], [0.9, 0.9]];
    const curve = fitIsotonic(pairs);
    expect(curve.length).toBe(5);
    expect(curve[0][1]).toBeCloseTo(0.1, 6);
    expect(curve[4][1]).toBeCloseTo(0.9, 6);
  });

  it("violação simples (decreasing pair) é pool-fixed pra média", () => {
    // Em x=0.3 o y=0.5 violação ↓ vizinhança; merge com vizinho x=0.5,y=0.2 → pool média 0.35
    const pairs: Array<[number, number]> = [[0.1, 0.1], [0.3, 0.5], [0.5, 0.2], [0.7, 0.7]];
    const curve = fitIsotonic(pairs);
    // Resultado esperado: [[0.1, 0.1], [0.3, 0.35], [0.5, 0.35], [0.7, 0.7]] (média 0.5+0.2)/2=0.35
    expect(curve[0][1]).toBeCloseTo(0.1, 6);
    expect(curve[1][1]).toBeCloseTo(0.35, 6);
    expect(curve[2][1]).toBeCloseTo(0.35, 6);
    expect(curve[3][1]).toBeCloseTo(0.7, 6);
  });

  it("preserva monotonicidade NÃO-decrescente em toda a curva", () => {
    const pairs: Array<[number, number]> = [[0.1, 0.7], [0.2, 0.3], [0.3, 0.5], [0.4, 0.2], [0.5, 0.9]];
    const curve = fitIsotonic(pairs);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i][1]).toBeGreaterThanOrEqual(curve[i - 1][1] - 1e-9);
    }
  });

  it("dataset vazio devolve []", () => {
    expect(fitIsotonic([])).toEqual([]);
  });

  it("ordena por x antes de PAV", () => {
    const pairs: Array<[number, number]> = [[0.5, 0.5], [0.1, 0.1], [0.3, 0.3]];
    const curve = fitIsotonic(pairs);
    expect(curve.map(([x]) => x)).toEqual([0.1, 0.3, 0.5]);
  });
});

describe("applyIsotonic — lookup + interpolação linear", () => {
  const curve: Array<[number, number]> = [[0.1, 0.05], [0.3, 0.25], [0.5, 0.55], [0.7, 0.75], [0.9, 0.95]];

  it("retorna o ponto exato quando x bate em um nó", () => {
    expect(applyIsotonic(curve, 0.5)).toBeCloseTo(0.55, 6);
  });

  it("interpola linearmente entre nós", () => {
    // entre 0.3→0.5: y vai de 0.25→0.55. Em x=0.4 (meio) → 0.40
    expect(applyIsotonic(curve, 0.4)).toBeCloseTo(0.4, 6);
  });

  it("clampa nas bordas (x abaixo do menor)", () => {
    expect(applyIsotonic(curve, 0.0)).toBeCloseTo(0.05, 6);
  });

  it("clampa nas bordas (x acima do maior)", () => {
    expect(applyIsotonic(curve, 1.0)).toBeCloseTo(0.95, 6);
  });

  it("curva vazia devolve x sem mudança (identidade)", () => {
    expect(applyIsotonic([], 0.5)).toBe(0.5);
  });
});
