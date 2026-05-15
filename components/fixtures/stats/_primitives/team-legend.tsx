export type Side = "home" | "away";

export function teamColor(side: Side): string {
  return side === "home" ? "var(--color-vermelho)" : "var(--color-depth)";
}

interface Props {
  home: string;
  away: string;
  className?: string;
}

export function TeamLegend({ home, away, className }: Props) {
  return (
    <div className={`flex gap-4 text-xs ${className ?? ""}`} data-team-legend>
      {(["home", "away"] as Side[]).map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 text-[var(--color-ink-muted)]"
        >
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: teamColor(s) }}
          />
          {s === "home" ? home : away}
        </span>
      ))}
    </div>
  );
}
