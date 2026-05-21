/**
 * Pool Adjacent Violators (PAV) — ajusta uma função monotônica não-decrescente
 * que minimiza erro quadrático contra os pares observados.
 *
 * Entrada: pares (p_predicted, observed_freq) — observed_freq pode ser 0/1
 * (eventos binários individuais) ou frequência agregada em bin.
 *
 * Saída: array ordenado por x com y monotônico não-decrescente. Pode ter
 * menos pontos que a entrada (vizinhos com mesmo y são compactados? — NÃO,
 * preservamos a granularidade pra interpolação).
 *
 * Referência: Barlow et al. (1972). Implementação clássica O(n).
 */
export function fitIsotonic(
  pairs: Array<[number, number]>,
): Array<[number, number]> {
  if (pairs.length === 0) return [];

  const sorted = pairs
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .slice()
    .sort((a, b) => a[0] - b[0]);

  if (sorted.length === 0) return [];

  // PAV: cada bloco mantém (sumY, weight, startIdx, endIdx).
  const blocks: Array<{ sumY: number; w: number; start: number; end: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    let b = { sumY: sorted[i][1], w: 1, start: i, end: i };
    // Merge enquanto a média do bloco corrente for MENOR que a do bloco anterior.
    while (blocks.length > 0) {
      const prev = blocks[blocks.length - 1];
      if (prev.sumY / prev.w <= b.sumY / b.w + 1e-12) break;
      b = {
        sumY: prev.sumY + b.sumY,
        w: prev.w + b.w,
        start: prev.start,
        end: b.end,
      };
      blocks.pop();
    }
    blocks.push(b);
  }

  // Expandir blocos → array per-x.
  const out: Array<[number, number]> = new Array(sorted.length);
  for (const b of blocks) {
    const y = b.sumY / b.w;
    for (let i = b.start; i <= b.end; i++) {
      out[i] = [sorted[i][0], y];
    }
  }
  return out;
}

/**
 * Aplica a curva isotônica em um ponto x. Lookup binário + interpolação
 * linear. Clampa nas bordas (x fora do range mapeia pro ponto mais próximo).
 * Curva vazia ⇒ função identidade (retorna x).
 */
export function applyIsotonic(
  curve: Array<[number, number]>,
  x: number,
): number {
  if (curve.length === 0) return x;
  if (x <= curve[0][0]) return curve[0][1];
  if (x >= curve[curve.length - 1][0]) return curve[curve.length - 1][1];

  let lo = 0;
  let hi = curve.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (curve[mid][0] <= x) lo = mid;
    else hi = mid;
  }
  const [x0, y0] = curve[lo];
  const [x1, y1] = curve[hi];
  if (x1 === x0) return y0;
  const t = (x - x0) / (x1 - x0);
  return y0 + t * (y1 - y0);
}
