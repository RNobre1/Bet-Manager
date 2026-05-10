const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUMBER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const fmt = {
  currency: (n: number) => BRL.format(n),
  /** Pass 0.0842 for 8.42% */
  percent: (n: number) => PERCENT.format(n),
  number: (n: number) => NUMBER.format(n),
  date: (d: Date | string) => DATE.format(typeof d === "string" ? new Date(d) : d),
  datetime: (d: Date | string) =>
    DATETIME.format(typeof d === "string" ? new Date(d) : d),
  /** Compact for hero numbers — strips currency symbol; pair with separate "BRL" label */
  bare: (n: number) => NUMBER.format(n),
  signed: (n: number) => (n >= 0 ? `+${NUMBER.format(n)}` : NUMBER.format(n)),
  signedPercent: (n: number) =>
    n >= 0 ? `+${PERCENT.format(n)}` : PERCENT.format(n),
};
