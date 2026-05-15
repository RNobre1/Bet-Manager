export interface TooltipRow {
  k: string;
  v: string;
}

interface Props {
  title: string;
  rows: TooltipRow[];
  reading?: string;
}

export function RichTooltipCard({ title, rows, reading }: Props) {
  return (
    <div
      data-rich-tooltip
      className="min-w-[150px] rounded-md border border-[var(--color-vermelho)] bg-[var(--color-surface-2)] p-2.5 shadow-lg"
    >
      <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-display)]">
        {title}
      </p>
      {rows.map((r) => (
        <div key={r.k} className="flex justify-between gap-4 text-xs">
          <span className="text-[var(--color-ink-muted)]">{r.k}</span>
          <span className="num text-[var(--color-ink-display)]">{r.v}</span>
        </div>
      ))}
      {reading ? (
        <p className="mt-1.5 border-t border-[var(--color-surface-3)] pt-1.5 text-xs text-[var(--color-ink-muted)]">
          {reading}
        </p>
      ) : null}
    </div>
  );
}
