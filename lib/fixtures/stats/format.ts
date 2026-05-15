const DASH = "—";

export function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return Number(v.toFixed(2)).toString();
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  return Math.round(v).toLocaleString("pt-BR");
}

export function fmtPct(
  v: number | null | undefined,
  opts: { raw?: boolean } = {},
): string {
  if (v == null || Number.isNaN(v)) return DASH;
  const pct = opts.raw ? v : v * 100;
  return `${Math.round(pct)}%`;
}

export function fmtSigned(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return DASH;
  const s = fmtNum(Math.abs(v));
  return v >= 0 ? `+${s}` : `-${s}`;
}
