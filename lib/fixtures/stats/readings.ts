import { fmtNum, fmtSigned } from "./format";

/** Friendly pt-BR labels for metric keys used across panels. */
export const METRIC_LABEL: Record<string, string> = {
  goals_ft_for: "gols",
  goals_ft_against: "gols sofridos",
  goals_1h_for: "gols 1T",
  goals_2h_for: "gols 2T",
  sot_for: "finalizações no gol",
  sot_against: "finalizações sofridas",
  corners_for: "escanteios",
  corners_2h_for: "escanteios 2T",
  cards_for: "cartões",
  booking_points_for: "booking points",
  fouls_for: "faltas",
};

const lbl = (k: string) => METRIC_LABEL[k] ?? k;

export interface Reading {
  title: string;
  text: string;
}

export function interpretR(r: number): string {
  const a = Math.abs(r);
  if (a < 0.3) return "desprezível";
  if (a < 0.5) return "fraca";
  if (a < 0.7) return "moderada";
  return "forte";
}

export function readCorrelation(x: string, y: string, r: number): Reading {
  const strength = interpretR(r);
  const dir = r >= 0 ? "andam juntos" : "andam em sentidos opostos";
  return {
    title:
      r >= 0
        ? `Quando ${lbl(x)} sobe, ${lbl(y)} também`
        : `${lbl(x)} alto puxa ${lbl(y)} pra baixo`,
    text: `Nos últimos 10, ${lbl(x)} e ${lbl(y)} ${dir} (correlação ${strength}, r=${fmtNum(r)}). ${
      strength === "forte" || strength === "moderada"
        ? "Sinal útil pro mercado relacionado a este time."
        : "Sinal fraco — pouco confiável isolado."
    }`,
  };
}

export function readTrend(metric: string, slope: number): Reading {
  const up = slope >= 0;
  return {
    title: up ? `${lbl(metric)} em alta` : `${lbl(metric)} em queda`,
    text: `${fmtSigned(slope)} ${lbl(metric)}/jogo nos últimos 5 vs 10 anteriores. ${
      up
        ? "Tendência de crescimento — over do time ganha força."
        : "Cuidado com over do time."
    }`,
  };
}

export function readOutlier(
  metric: string,
  value: number,
  mean: number,
): Reading {
  return {
    title: `Jogo atípico em ${lbl(metric)}`,
    text: `${fmtNum(value)} ${lbl(metric)} fora da média (${fmtNum(mean)}) nos últimos 10. Considere descartar como ruído ao projetar.`,
  };
}

export function readScatterPair(x: string, y: string, r: number): string {
  const strength = interpretR(r);
  const verb =
    strength === "forte"
      ? "prevê bem"
      : strength === "moderada"
        ? "ajuda a prever"
        : "quase não prevê";
  return `${lbl(x)} × ${lbl(y)}: r=${fmtNum(r)} — relação ${strength}; ${lbl(x)} ${verb} ${lbl(y)} deste time.`;
}
