// lib/banca/metrics.ts
// Funções puras de métricas de banca — extraídas de app/(dashboard)/page.tsx.
// Sem side-effects; sem imports de runtime (apenas tipos TS).

// ---------------------------------------------------------------------------
// computeRoi
// ROI = lucro acumulado / capital líquido depositado
// Retorna null quando netCapital <= 0 (sem divisão por zero ou denominador
// negativo — replica exatamente o `netCapital > 0 ? ... : 0` original do
// dashboard, onde `?? 0` no consumidor produz o mesmo valor 0 que o código
// inline produzia com `: 0`).
// ---------------------------------------------------------------------------
export function computeRoi({
  cumulativePl,
  netCapital,
}: {
  cumulativePl: number;
  netCapital: number;
}): number | null {
  if (netCapital <= 0) return null;
  return cumulativePl / netCapital;
}

// ---------------------------------------------------------------------------
// computeYield
// Yield = (retorno - apostado) / apostado (apostas resolvidas)
// Retorna null quando resolvedStaked <= 0 (replica o `resolvedStaked > 0 ?
// ... : 0` original do dashboard — o `?? 0` no consumidor produz o mesmo 0).
// ---------------------------------------------------------------------------
export function computeYield({
  resolvedReturned,
  resolvedStaked,
}: {
  resolvedReturned: number;
  resolvedStaked: number;
}): number | null {
  if (resolvedStaked <= 0) return null;
  return (resolvedReturned - resolvedStaked) / resolvedStaked;
}

// ---------------------------------------------------------------------------
// computeWinRate
// Win rate = ganhas / (ganhas + perdidas)  — void não conta
// Retorna null quando não há apostas resolvidas.
// ---------------------------------------------------------------------------
export function computeWinRate({
  won,
  lost,
}: {
  won: number;
  lost: number;
}): number | null {
  const total = won + lost;
  if (total === 0) return null;
  return won / total;
}

// ---------------------------------------------------------------------------
// computeMaxDrawdown
// Maior queda pico→vale numa série de P/L acumulado.
// Replicação exata da lógica inline de page.tsx.
// ---------------------------------------------------------------------------
export function computeMaxDrawdown(series: number[]): number {
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const value of series) {
    if (value > peak) peak = value;
    const dd = peak - value;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  return maxDrawdown;
}

// ---------------------------------------------------------------------------
// carryForwardSeries
// Recebe pontos esparsos {date, balance} e uma janela [from, to] (YYYY-MM-DD).
// Retorna array diário completo onde dias sem snapshot recebem o último
// saldo conhecido. Se o array de entrada for vazio, retorna [].
// O primeiro elemento emitido é sempre o ponto "from" — mas apenas quando
// houver pelo menos um ponto na entrada (semantics: não emite dias antes do
// primeiro dado).
// ---------------------------------------------------------------------------
export function carryForwardSeries(
  points: { date: string; balance: number }[],
  from: string,
  to: string,
): { date: string; balance: number }[] {
  if (points.length === 0) return [];

  // Indexar pontos por data para lookup O(1)
  const byDate = new Map<string, number>();
  for (const p of points) {
    byDate.set(p.date, p.balance);
  }

  const result: { date: string; balance: number }[] = [];
  let lastBalance = points[0].balance;
  let current = parseDateUTC(from);
  const end = parseDateUTC(to);

  while (current <= end) {
    const dateStr = formatDateUTC(current);
    if (byDate.has(dateStr)) {
      lastBalance = byDate.get(dateStr)!;
    }
    result.push({ date: dateStr, balance: lastBalance });
    current = addOneDay(current);
  }

  return result;
}

// ---------------------------------------------------------------------------
// computeStreaks
// Calcula sequências correntes de vitórias e derrotas a partir de uma série
// de resultados (mais recente primeiro).
// ---------------------------------------------------------------------------
export function computeStreaks(results: ("W" | "L")[]): {
  currentWinStreak: number;
  currentLoseStreak: number;
  maxWinStreak: number;
  maxLoseStreak: number;
} {
  let currentWinStreak = 0;
  let currentLoseStreak = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;

  let winStreak = 0;
  let loseStreak = 0;

  // Percorrer do mais antigo para o mais recente (reverso) para calcular max streaks
  for (const r of [...results].reverse()) {
    if (r === "W") {
      winStreak++;
      loseStreak = 0;
    } else {
      loseStreak++;
      winStreak = 0;
    }
    if (winStreak > maxWinStreak) maxWinStreak = winStreak;
    if (loseStreak > maxLoseStreak) maxLoseStreak = loseStreak;
  }

  // Sequência corrente: contar do início (mais recente)
  for (const r of results) {
    if (r === "W") {
      currentWinStreak++;
    } else {
      break;
    }
  }
  for (const r of results) {
    if (r === "L") {
      currentLoseStreak++;
    } else {
      break;
    }
  }

  return { currentWinStreak, currentLoseStreak, maxWinStreak, maxLoseStreak };
}

// ---------------------------------------------------------------------------
// Helpers internos de data (puro, sem TZInfo nem luxon)
// ---------------------------------------------------------------------------
function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addOneDay(d: Date): Date {
  return new Date(d.getTime() + 86_400_000);
}
