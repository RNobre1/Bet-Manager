"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

interface DateChipsProps {
  /** Currently-selected date in YYYY-MM-DD (BRT). */
  selected: string;
  /** Today's date in BRT (server-computed so SSR + hydration match). */
  todayIso: string;
  /** Tomorrow's date in BRT. */
  tomorrowIso: string;
}

const DOW_PT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"] as const;

function addDaysIso(iso: string, days: number): string {
  // Parse as UTC midnight; arithmetic in UTC avoids local-TZ surprises.
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function dayOfWeek(iso: string): string {
  // Use UTC components so the label is deterministic regardless of viewer TZ.
  const d = new Date(iso + "T00:00:00Z");
  return DOW_PT[d.getUTCDay()];
}

/**
 * 7-day chip selector. Today/Tomorrow get explicit labels; days 3-7 get the
 * weekday acronym. Clicking a chip navigates to `/fixtures?date=YYYY-MM-DD`
 * via `router.push` so the URL stays canonical and shareable. The component
 * is intentionally URL-driven (no internal state) — the source of truth is
 * the `?date` searchParam read by the server page.
 */
export function DateChips({ selected, todayIso, tomorrowIso }: DateChipsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const items = Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(todayIso, i);
    let label: string;
    if (iso === todayIso) label = "HOJE";
    else if (iso === tomorrowIso) label = "AMANHÃ";
    else label = dayOfWeek(iso);
    return { iso, label, date: ddmm(iso) };
  });

  function navigate(iso: string) {
    startTransition(() => {
      router.push(`/fixtures?date=${iso}`);
    });
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      role="group"
      aria-label="Escolher data"
      data-pending={isPending ? "true" : undefined}
    >
      {items.map((item) => {
        const active = item.iso === selected;
        return (
          <button
            key={item.iso}
            type="button"
            onClick={() => navigate(item.iso)}
            aria-pressed={active}
            className={[
              "flex flex-col items-start rounded-[var(--radius-sm)] border px-3 py-2 transition-colors",
              active
                ? "border-[var(--color-vermelho-low)] bg-[color-mix(in_srgb,var(--color-vermelho)_12%,transparent)] text-[var(--color-ink-display)]"
                : "border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-ink)]",
            ].join(" ")}
          >
            <span
              className="label"
              style={active ? { color: "var(--color-vermelho)" } : undefined}
            >
              {item.label}
            </span>
            <span className="num text-xs">{item.date}</span>
          </button>
        );
      })}
    </div>
  );
}
