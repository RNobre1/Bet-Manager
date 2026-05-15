# Refinamento UX dos painéis de stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Cada task roda em worktree isolada do abissal (`/home/rnobre/Área de trabalho/Projetos Git/abissal/.worktrees/<t>`). Sem `Co-Authored-By`. Conventional Commits pt-BR.

**Goal:** Tornar os 5 painéis confusos de `/fixtures/[id]/stats` legíveis via camada explicativa compartilhada + correção de lógica, sem trocar os tipos de gráfico.

**Architecture:** 4 primitivos reutilizáveis (`_primitives/`) + 2 helpers puros (`format.ts`, `readings.ts`) construídos primeiro; depois correções de lógica (insights/derive) em paralelo; depois refactor dos painéis consumindo os primitivos. Nenhuma mudança no scraper ou no shape de `detail_json`.

**Tech Stack:** Next.js 16, React 18, TypeScript, recharts ^2.15, lightweight-charts ^4.2, Radix Popover, vitest + happy-dom, Tailwind v4 tokens.

**Spec canônico:** `docs/pesquisas/stats-ux-refinamento-design.md`

---

## File structure

```
lib/fixtures/stats/format.ts                 (novo — fmt helpers puros)
lib/fixtures/stats/format.test.ts            (novo)
lib/fixtures/stats/readings.ts               (novo — gera frases de leitura)
lib/fixtures/stats/readings.test.ts          (novo)
components/fixtures/stats/_primitives/chart-frame.tsx      (novo)
components/fixtures/stats/_primitives/team-legend.tsx      (novo)
components/fixtures/stats/_primitives/info-popover.tsx     (novo)
components/fixtures/stats/_primitives/rich-tooltip.tsx     (novo)
tests/unit/components/fixtures/stats/_primitives/*.test.tsx (novos)
lib/fixtures/stats/insights.ts               (modify — tautology filter + readings)
lib/fixtures/stats/derive.ts                 (modify — SCATTER_PRESETS, interpretR, referenceValue, xLabels)
components/fixtures/stats/panels/{recent-matches,momentum-chart,players,scatter-playground,predictions,insights,radar-comparison,distributions}.tsx (modify)
app/(dashboard)/fixtures/[id]/stats/page.tsx (modify — só re-plug de props novos)
tests/integration/stats-page.test.tsx        (modify — novos elementos)
tests/e2e/stats-page.spec.ts                 (modify — tooltip hover + popover + axe)
```

---

## Wave 1 — Primitivos (SOLO, sem paralelismo)

### Task 1: Helpers puros `format.ts` + `readings.ts`

**Files:**
- Create: `lib/fixtures/stats/format.ts`
- Test: `lib/fixtures/stats/format.test.ts`
- Create: `lib/fixtures/stats/readings.ts`
- Test: `lib/fixtures/stats/readings.test.ts`

- [ ] **Step 1: Write failing test `format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { fmtNum, fmtInt, fmtPct, fmtSigned } from "./format";

describe("fmtNum", () => {
  it("rounds to 2 decimals, trims trailing zeros", () => {
    expect(fmtNum(0.4525455688246386)).toBe("0.45");
    expect(fmtNum(2)).toBe("2");
    expect(fmtNum(1.5)).toBe("1.5");
  });
  it("returns em-dash for null/undefined/NaN", () => {
    expect(fmtNum(null)).toBe("—");
    expect(fmtNum(undefined)).toBe("—");
    expect(fmtNum(NaN)).toBe("—");
  });
});
describe("fmtInt", () => {
  it("groups thousands with a dot (pt-BR)", () => {
    expect(fmtInt(1591)).toBe("1.591");
    expect(fmtInt(13)).toBe("13");
  });
  it("em-dash for null", () => { expect(fmtInt(null)).toBe("—"); });
});
describe("fmtPct", () => {
  it("renders 0..1 as integer percent", () => {
    expect(fmtPct(0.73)).toBe("73%");
    expect(fmtPct(1)).toBe("100%");
  });
  it("accepts already-percent when >1 via raw flag", () => {
    expect(fmtPct(73, { raw: true })).toBe("73%");
  });
});
describe("fmtSigned", () => {
  it("prefixes + for positive", () => {
    expect(fmtSigned(0.88)).toBe("+0.88");
    expect(fmtSigned(-0.4)).toBe("-0.4");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `cd <worktree> && pnpm test lib/fixtures/stats/format`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `format.ts`**

```ts
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
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test lib/fixtures/stats/format`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/fixtures/stats/format.ts lib/fixtures/stats/format.test.ts
git commit -m "feat(stats): helper format.ts (fmtNum/Int/Pct/Signed)"
```

- [ ] **Step 6: Write failing test `readings.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { readCorrelation, readTrend, readOutlier, readScatterPair } from "./readings";

describe("readCorrelation", () => {
  it("forte positiva → título + leitura acionável", () => {
    const r = readCorrelation("sot_for", "goals_ft_for", 0.88);
    expect(r.title.length).toBeGreaterThan(0);
    expect(r.text).toContain("0.88");
    expect(r.text.toLowerCase()).toContain("mercado");
  });
});
describe("readTrend", () => {
  it("queda → menciona direção e cautela", () => {
    const r = readTrend("goals_ft_for", -0.4);
    expect(r.text).toContain("-0.4");
    expect(r.title.toLowerCase()).toMatch(/queda|cai/);
  });
});
describe("readOutlier", () => {
  it("cita valor e média", () => {
    const r = readOutlier("corners_for", 8, 2.1);
    expect(r.text).toContain("8");
    expect(r.text).toContain("2.1");
  });
});
describe("readScatterPair", () => {
  it("fraco → diz pouco preditivo", () => {
    const s = readScatterPair("sot_for", "goals_ft_for", 0.38);
    expect(s.toLowerCase()).toContain("fraca");
  });
});
```

- [ ] **Step 7: Run, expect FAIL**

Run: `pnpm test lib/fixtures/stats/readings` → FAIL module not found.

- [ ] **Step 8: Implement `readings.ts`**

```ts
import { fmtNum, fmtSigned } from "./format";

/** Friendly pt-BR labels for metric keys used across panels. */
export const METRIC_LABEL: Record<string, string> = {
  goals_ft_for: "gols", goals_ft_against: "gols sofridos",
  goals_1h_for: "gols 1T", goals_2h_for: "gols 2T",
  sot_for: "finalizações no gol", sot_against: "finalizações sofridas",
  corners_for: "escanteios", corners_2h_for: "escanteios 2T",
  cards_for: "cartões", booking_points_for: "booking points",
  fouls_for: "faltas",
};

const lbl = (k: string) => METRIC_LABEL[k] ?? k;

export interface Reading { title: string; text: string; }

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
    title: up
      ? `${lbl(metric)} em alta`
      : `${lbl(metric)} em queda`,
    text: `${fmtSigned(slope)} ${lbl(metric)}/jogo nos últimos 5 vs 10 anteriores. ${
      up ? "Tendência de crescimento — over do time ganha força." : "Cuidado com over do time."
    }`,
  };
}

export function readOutlier(metric: string, value: number, mean: number): Reading {
  return {
    title: `Jogo atípico em ${lbl(metric)}`,
    text: `${fmtNum(value)} ${lbl(metric)} fora da média (${fmtNum(mean)}) nos últimos 10. Considere descartar como ruído ao projetar.`,
  };
}

export function readScatterPair(x: string, y: string, r: number): string {
  const strength = interpretR(r);
  const verb =
    strength === "forte" ? "prevê bem" :
    strength === "moderada" ? "ajuda a prever" :
    "quase não prevê";
  return `${lbl(x)} × ${lbl(y)}: r=${fmtNum(r)} — relação ${strength}; ${lbl(x)} ${verb} ${lbl(y)} deste time.`;
}
```

- [ ] **Step 9: Run, expect PASS**

Run: `pnpm test lib/fixtures/stats/readings` → PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/fixtures/stats/readings.ts lib/fixtures/stats/readings.test.ts
git commit -m "feat(stats): readings.ts (correlation/trend/outlier/scatter em pt-BR)"
```

---

### Task 2: 4 primitivos de UI

**Files:**
- Create: `components/fixtures/stats/_primitives/team-legend.tsx`
- Create: `components/fixtures/stats/_primitives/rich-tooltip.tsx`
- Create: `components/fixtures/stats/_primitives/info-popover.tsx`
- Create: `components/fixtures/stats/_primitives/chart-frame.tsx`
- Test: `tests/unit/components/fixtures/stats/_primitives/{team-legend,rich-tooltip,info-popover,chart-frame}.test.tsx`

- [ ] **Step 1: Failing test `team-legend.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamLegend, teamColor } from "@/components/fixtures/stats/_primitives/team-legend";

describe("TeamLegend", () => {
  it("renders both team names with swatches", () => {
    render(<TeamLegend home="Aston Villa" away="Liverpool" />);
    expect(screen.getByText("Aston Villa")).toBeInTheDocument();
    expect(screen.getByText("Liverpool")).toBeInTheDocument();
  });
  it("teamColor maps side to token", () => {
    expect(teamColor("home")).toBe("var(--color-vermelho)");
    expect(teamColor("away")).toBe("var(--color-depth)");
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `pnpm test _primitives/team-legend` → FAIL.

- [ ] **Step 3: Implement `team-legend.tsx`**

```tsx
export type Side = "home" | "away";

export function teamColor(side: Side): string {
  return side === "home" ? "var(--color-vermelho)" : "var(--color-depth)";
}

interface Props { home: string; away: string; className?: string; }

export function TeamLegend({ home, away, className }: Props) {
  return (
    <div
      className={`flex gap-4 text-xs ${className ?? ""}`}
      data-team-legend
    >
      {(["home", "away"] as Side[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5 text-[var(--color-ink-muted)]">
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
```

- [ ] **Step 4: Run → PASS**

Run: `pnpm test _primitives/team-legend` → PASS.

- [ ] **Step 5: Failing test `rich-tooltip.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RichTooltipCard } from "@/components/fixtures/stats/_primitives/rich-tooltip";

describe("RichTooltipCard", () => {
  it("renders title, formatted rows, reading", () => {
    render(
      <RichTooltipCard
        title="M. Salah · Liverpool"
        rows={[{ k: "Minutos", v: "2.480" }, { k: "G+A /90", v: "0.51" }]}
        reading="Alto volume + decisivo."
      />,
    );
    expect(screen.getByText("M. Salah · Liverpool")).toBeInTheDocument();
    expect(screen.getByText("2.480")).toBeInTheDocument();
    expect(screen.getByText("Alto volume + decisivo.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run → FAIL**, then implement `rich-tooltip.tsx`

```tsx
export interface TooltipRow { k: string; v: string; }

interface Props { title: string; rows: TooltipRow[]; reading?: string; }

export function RichTooltipCard({ title, rows, reading }: Props) {
  return (
    <div
      data-rich-tooltip
      className="min-w-[150px] rounded-md border border-[var(--color-vermelho)] bg-[var(--color-surface-2)] p-2.5 shadow-lg"
    >
      <p className="mb-1.5 text-sm font-bold text-[var(--color-ink-display)]">{title}</p>
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
```

- [ ] **Step 7: Run → PASS. Failing test `info-popover.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InfoPopover } from "@/components/fixtures/stats/_primitives/info-popover";

describe("InfoPopover", () => {
  it("opens content on trigger click", async () => {
    const u = userEvent.setup();
    render(<InfoPopover label="como ler"><p>conteúdo de ajuda</p></InfoPopover>);
    await u.click(screen.getByRole("button", { name: /como ler/i }));
    expect(await screen.findByText("conteúdo de ajuda")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run → FAIL**, then implement `info-popover.tsx` (Radix Popover, já no projeto)

```tsx
"use client";
import * as Popover from "@radix-ui/react-popover";
import type { ReactNode } from "react";

interface Props { label: string; children: ReactNode; }

export function InfoPopover({ label, children }: Props) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--color-ink-faint)] text-[9px] font-semibold text-[var(--color-ink-muted)] hover:border-[var(--color-vermelho)]"
      >
        i
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 max-w-xs rounded-md border border-[var(--color-surface-3)] bg-[var(--color-surface-2)] p-3 text-xs leading-relaxed text-[var(--color-ink-muted)] shadow-xl"
        >
          {children}
          <Popover.Arrow className="fill-[var(--color-surface-2)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 9: Run → PASS. Failing test `chart-frame.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartFrame } from "@/components/fixtures/stats/_primitives/chart-frame";

describe("ChartFrame", () => {
  it("renders Y ticks, X labels and a labeled reference line", () => {
    render(
      <ChartFrame
        yTicks={[0, 2, 4]}
        xLabels={["NEW", "FUL", "BRI"]}
        referenceLines={[{ value: 1.8, label: "média 1.8", color: "var(--color-ink-faint)" }]}
        height={160}
      >
        <div data-testid="chart-body" />
      </ChartFrame>,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("NEW")).toBeInTheDocument();
    expect(screen.getByText("média 1.8")).toBeInTheDocument();
    expect(screen.getByTestId("chart-body")).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run → FAIL**, then implement `chart-frame.tsx`

```tsx
import type { ReactNode } from "react";

export interface ReferenceLine { value: number; label: string; color: string; }

interface Props {
  yTicks: number[];           // descending domain ticks, top→bottom
  xLabels: string[];
  referenceLines?: ReferenceLine[];
  yMax?: number;              // defaults to max(yTicks)
  height?: number;
  children: ReactNode;        // the actual chart, absolutely filling the plot
}

export function ChartFrame({
  yTicks, xLabels, referenceLines = [], yMax, height = 160, children,
}: Props) {
  const max = yMax ?? Math.max(...yTicks, 1);
  return (
    <div data-chart-frame style={{ position: "relative", paddingLeft: 28, height }}>
      <div
        style={{ position: "absolute", left: 0, top: 0, bottom: 18, width: 24 }}
        className="flex flex-col justify-between text-right num text-[9px] text-[var(--color-ink-faint)]"
      >
        {[...yTicks].sort((a, b) => b - a).map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div
        style={{ position: "absolute", left: 28, right: 0, top: 0, bottom: 18 }}
        className="border-l border-b border-[var(--color-surface-3)]"
      >
        {referenceLines.map((r) => (
          <div key={r.label}>
            <div
              style={{
                position: "absolute", left: 0, right: 0,
                bottom: `${(r.value / max) * 100}%`,
                borderTop: `1px dashed ${r.color}`,
              }}
            />
            <span
              style={{ position: "absolute", right: 2, bottom: `${(r.value / max) * 100}%` }}
              className="num text-[9px] text-[var(--color-ink-muted)]"
            >
              {r.label}
            </span>
          </div>
        ))}
        {children}
      </div>
      <div
        style={{ position: "absolute", left: 28, right: 0, bottom: 0, height: 16 }}
        className="flex justify-between num text-[9px] text-[var(--color-ink-faint)]"
      >
        {xLabels.map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Run all primitives → PASS**

Run: `pnpm test _primitives` → all PASS.

- [ ] **Step 12: Gate + commit**

```bash
pnpm lint && pnpm typecheck && pnpm test _primitives lib/fixtures/stats/format lib/fixtures/stats/readings
git add components/fixtures/stats/_primitives tests/unit/components/fixtures/stats/_primitives
git commit -m "feat(stats): primitivos ChartFrame/TeamLegend/InfoPopover/RichTooltip"
```

---

## Wave 2 — Lógica (PARALELO: Task 3 ‖ Task 4, worktrees separadas)

### Task 3 (T-A): Insights — filtro tautologia + readings + ranking

**Files:**
- Modify: `lib/fixtures/stats/insights.ts`
- Modify: `lib/fixtures/stats/insights.test.ts`

- [ ] **Step 1: Add failing tests** em `insights.test.ts`:

```ts
it("filters tautological correlation pairs", () => {
  // cartões ↔ booking points é determinístico → não deve virar insight
  const matches = makeMatchesWithPerfectCardsBookingCorrelation();
  const out = computeCorrelations(matches);
  expect(out.find((i) => /booking/.test(i.headline) && /cart/.test(i.headline))).toBeUndefined();
});
it("correlation insight uses readings.ts copy (mercado/r= present)", () => {
  const out = computeCorrelations(makeMatchesSotGoals(0.88));
  const ins = out[0];
  expect(ins.text).toMatch(/r=0\.88/);
  expect(ins.text.toLowerCase()).toContain("mercado");
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm test lib/fixtures/stats/insights`).

- [ ] **Step 3: Implement** — adicionar em `insights.ts`:

```ts
// Pares estruturalmente determinísticos: correlação alta é tautológica, não sinal.
const TAUTOLOGICAL_PAIRS: ReadonlySet<string> = new Set([
  "cards_for|booking_points_for",
  "cards_against|booking_points_against",
  "goals_ft_for|goals_1h_for",
  "goals_ft_for|goals_2h_for",
  "goals_ft_against|goals_1h_against",
  "goals_ft_against|goals_2h_against",
]);

function isTautological(a: string, b: string): boolean {
  return (
    TAUTOLOGICAL_PAIRS.has(`${a}|${b}`) || TAUTOLOGICAL_PAIRS.has(`${b}|${a}`)
  );
}
```

No loop de pares de `computeCorrelations`, logo após escolher `(a,b)`: `if (isTautological(a, b)) continue;`. Trocar a construção de `headline`/`text` por `readCorrelation(a, b, r)` de `./readings` (`import { readCorrelation, readTrend, readOutlier } from "./readings"`), mapeando `title→headline`, `text→text`. Idem `computeTrends` → `readTrend(metric, slope)`, `computeOutliers` → `readOutlier(metric, value, mean)`.

- [ ] **Step 4: Run → PASS**. Rodar suite inteira de insights pra garantir não-regressão (`pnpm test lib/fixtures/stats/insights`).

- [ ] **Step 5: Commit**

```bash
git add lib/fixtures/stats/insights.ts lib/fixtures/stats/insights.test.ts
git commit -m "feat(stats): filtra correlações tautológicas + readings nos insights"
```

### Task 4 (T-B): Derive — SCATTER_PRESETS + interpretR + referenceValue/xLabels

**Files:**
- Modify: `lib/fixtures/stats/derive.ts`
- Modify: `lib/fixtures/stats/derive.test.ts`

- [ ] **Step 1: Failing tests** em `derive.test.ts`:

```ts
import { SCATTER_PRESETS, deriveRecentSeries } from "./derive";

it("SCATTER_PRESETS has curated labelled pairs", () => {
  expect(SCATTER_PRESETS.length).toBeGreaterThanOrEqual(3);
  const p = SCATTER_PRESETS[0];
  expect(p).toHaveProperty("x"); expect(p).toHaveProperty("y"); expect(p).toHaveProperty("label");
});
it("deriveRecentSeries returns values, xLabels (opponent), referenceValue (mean)", () => {
  const matches = makeNormalizedMatches([0,3,1,2,1,4]); // goals_ft_for
  const s = deriveRecentSeries(matches, "goals_ft_for");
  expect(s.values).toEqual([0,3,1,2,1,4]);
  expect(s.xLabels.length).toBe(6);
  expect(s.referenceValue).toBeCloseTo(11/6, 5);
});
```

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implement** em `derive.ts`:

```ts
export interface ScatterPreset { x: string; y: string; label: string; }

export const SCATTER_PRESETS: ScatterPreset[] = [
  { x: "sot_for", y: "goals_ft_for", label: "Finalizações × Gols" },
  { x: "corners_for", y: "goals_2h_for", label: "Escanteios × Gols 2T" },
  { x: "fouls_for", y: "cards_for", label: "Faltas × Cartões" },
  { x: "shots_for", y: "sot_for", label: "Chutes × No gol" },
];

export interface RecentSeries {
  values: (number | null)[];
  xLabels: string[];
  referenceValue: number;
}

export function deriveRecentSeries(
  matches: NormalizedRecentMatch[],
  metric: keyof NormalizedRecentMatch,
): RecentSeries {
  const values = matches.map((m) => {
    const v = m[metric];
    return typeof v === "number" ? v : null;
  });
  const finite = values.filter((v): v is number => v != null && Number.isFinite(v));
  const referenceValue = finite.length
    ? finite.reduce((a, b) => a + b, 0) / finite.length
    : 0;
  const xLabels = matches.map((m) =>
    (m.opponent ?? "?").slice(0, 3).toUpperCase(),
  );
  return { values, xLabels, referenceValue };
}
```

(`interpretR` já vive em `readings.ts` da Task 1 — reusar via import, não duplicar. Se `derive.ts` precisar, `import { interpretR } from "./readings"`.)

- [ ] **Step 4: Run → PASS**. Suite derive inteira (`pnpm test lib/fixtures/stats/derive`).

- [ ] **Step 5: Commit**

```bash
git add lib/fixtures/stats/derive.ts lib/fixtures/stats/derive.test.ts
git commit -m "feat(stats): SCATTER_PRESETS + deriveRecentSeries (xLabels/referenceValue)"
```

---

## Wave 3 — Refactor dos painéis (PARALELO: Task 5 ‖ 6 ‖ 7)

> Cada task consome apenas primitivos (Wave 1) + lógica (Wave 2) já mergeados. **Não** editar `page.tsx` (Task 8 faz o re-plug). Padrão de refactor idêntico nos três: (a) envolver chart em `<ChartFrame>` quando aplicável; (b) adicionar `<TeamLegend home={...} away={...}/>` no topo; (c) trocar tooltip por `<RichTooltipCard>` com valores via `fmt*`; (d) adicionar `<InfoPopover label="como ler">` com copy curta de aposta; (e) caption curto fixo abaixo do título.

### Task 5 (T-C): recent-matches + momentum-chart

**Files:** Modify `components/fixtures/stats/panels/recent-matches.tsx` + `.test.tsx`; `components/fixtures/stats/panels/momentum-chart.tsx` + `.test.tsx`.

- [ ] **Step 1:** Failing tests — recent-matches deve: renderizar `<TeamLegend>`, eixo Y com tick numérico, valor formatado em cada ponto, linha de referência rotulada (`média X.X`), X = adversário. Test: `expect(screen.getByText(/média/)).toBeInTheDocument()`, `expect(screen.getByText("NEW")).toBeInTheDocument()`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Refactor: usar `deriveRecentSeries(matches, metric)` → `{values,xLabels,referenceValue}`; envolver o `<LineChart>` recharts em `<ChartFrame yTicks={...} xLabels={s.xLabels} referenceLines={[{value:s.referenceValue,label:\`média ${fmtNum(s.referenceValue)}\`,color:"var(--color-ink-faint)"}]}>`; recharts `<Line type="linear" dot label>` (sem `type="monotone"` — mata spline); tooltip `content={<RichTooltipFromRecharts/>}` (adaptador que mapeia payload→`RichTooltipCard`). momentum-chart: aplicar `<ChartFrame>` (Y) + `<TeamLegend>`.
- [ ] **Step 4:** Run → PASS. `pnpm lint && typecheck && test components/fixtures/stats/panels/recent-matches components/fixtures/stats/panels/momentum-chart`.
- [ ] **Step 5:** Commit `feat(stats): recent-matches/momentum honestos (ChartFrame+legend+tooltip)`.

### Task 6 (T-D): players scatter + scatter-playground

**Files:** Modify `players.tsx`+test; `scatter-playground.tsx`+test.

- [ ] **Step 1:** Failing tests — players: `<TeamLegend>` presente, tooltip mostra nome + `fmtInt(minutos)` (ex "2.480") + `fmtNum(eff)` (ex "0.45", nunca "0.4525…"), eixo rotulado "Decisivo /90min" e "Minutos jogados", linhas de quadrante (mediana). scatter-playground: chips de `SCATTER_PRESETS`, badge `interpretR(r)` ("fraca"/"forte"), frase `readScatterPair(...)`, `<TeamLegend>`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Refactor players: substituir tooltip atual por `<RichTooltipCard title={`${p.name} · ${teamSideName}`} rows={[{k:"Minutos",v:fmtInt(p.minutes)},{k:"G+A /90",v:fmtNum(p.eff)}]} reading={...}/>`; adicionar `ReferenceLine` recharts nas medianas (x=median minutes, y=median eff) + rótulo de quadrante; eixos `<XAxis label>`/`<YAxis label>`; `<TeamLegend>` + `<InfoPopover>` + caption. scatter-playground: render chips a partir de `SCATTER_PRESETS` (onClick seta x/y), badge ao lado do `R =` com `interpretR(r)`, parágrafo `readScatterPair(x,y,r)`, `<TeamLegend>`, `<InfoPopover>`.
- [ ] **Step 4:** Run → PASS. lint/typecheck/test desses 2 painéis.
- [ ] **Step 5:** Commit `feat(stats): players/scatter-playground legíveis (presets+interpretR+tooltip)`.

### Task 7 (T-E): predictions + insights + radar + distributions

**Files:** Modify `predictions.tsx`+test; `insights.tsx`+test; `radar-comparison.tsx`+test; `distributions.tsx`+test.

- [ ] **Step 1:** Failing tests — predictions: chip cor por força (≥90 verde / 70–89 âmbar / <70 neutro) via `data-strength`; colunas de evidência com cabeçalho `home`/`away` + swatch (`teamColor`); `<InfoPopover>`. insights: rótulo-palavra por kind (`CORRELAÇÃO`/`TENDÊNCIA`/`PADRÃO`/`OUTLIER`) em vez de `∝◈‼`; cor por kind. radar: `<TeamLegend>` + tooltip rica. distributions: `<RichTooltipCard>` no hover do box + `<InfoPopover>` "como ler boxplot".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Refactor:
  - predictions: helper local `strengthColor(chance)` → token; `<span data-strength={bucket} style={{background}}>`; cabeçalho de cada coluna `<div><span swatch/>{home}</div>` / idem away usando `teamColor("home"|"away")`; `<InfoPopover label="como ler predições">` copy: "Predição é do JOGO. Bullets = evidência da forma recente de cada lado."
  - insights: trocar `ICON_BY_KIND` por `LABEL_BY_KIND = {correlation:"CORRELAÇÃO",trend:"TENDÊNCIA",pattern:"PADRÃO",outlier:"OUTLIER"}` + `COLOR_BY_KIND`; render `<span class="label" style={{color}}>{LABEL_BY_KIND[kind]}</span>`.
  - radar: `<TeamLegend home away/>` acima do chart; `<Tooltip content={<RichTooltipFromRecharts/>}>`.
  - distributions: `<RichTooltipCard>` on box hover (min/q1/median/q3/max formatados via `fmtNum`); `<InfoPopover>` explicando boxplot.
- [ ] **Step 4:** Run → PASS. lint/typecheck/test dos 4 painéis.
- [ ] **Step 5:** Commit `feat(stats): predictions/insights/radar/distributions com camada explicativa`.

---

## Wave 3 fechamento — Task 8: Integração (orchestrator, solo)

**Files:** Modify `app/(dashboard)/fixtures/[id]/stats/page.tsx`; `tests/integration/stats-page.test.tsx`; `tests/e2e/stats-page.spec.ts`.

- [ ] **Step 1:** Falhar integration test esperando: `[data-team-legend]` presente em ≥1 painel, nenhum texto cru tipo `/\d\.\d{6,}/` (regressão float), `[data-rich-tooltip]` montável.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Re-plug em `page.tsx` apenas se algum painel mudou assinatura de props (recent-matches passou a precisar `metric` default + `opponent` já vem do deriver; players precisa `homeTeam/awayTeam` pro legend; scatter idem). Ajustar os `node:` dos PanelSlots afetados. Não refatorar layout.
- [ ] **Step 4:** Estender `stats-page.spec.ts` (Playwright): hover num ponto → `[data-rich-tooltip]` visível; click no ⓘ → popover; `AxeBuilder().analyze()` 0 violations. Mantém skip-clean se sem auth/DB.
- [ ] **Step 5:** Run full: `pnpm lint && pnpm typecheck && pnpm test`. Expected: tudo verde, contagem ≥ baseline + novos.
- [ ] **Step 6:** Commit `feat(stats): integra camada explicativa nos 14 slots + e2e tooltip/popover`.

---

## Self-review (preenchido)

- **Spec coverage:** primitivos→Task2; format/readings→Task1; tautologia+readings insights→Task3; presets/interpretR/recentSeries→Task4; recent-matches/momentum→Task5; players/scatter-playground→Task6; predictions/insights/radar/distributions→Task7; integração+e2e+regressão float→Task8. Todos os itens do spec mapeados.
- **Placeholder scan:** sem TBD/TODO; código real em cada step de criação; refactors repetitivos descritos com o pattern explícito + arquivos exatos (DRY — pattern definido 1x no header da Wave 3).
- **Type consistency:** `teamColor(Side)`, `RichTooltipCard({title,rows,reading})`, `ChartFrame({yTicks,xLabels,referenceLines,...})`, `deriveRecentSeries→{values,xLabels,referenceValue}`, `SCATTER_PRESETS:{x,y,label}[]`, `interpretR` mora só em `readings.ts` (reusado, não duplicado) — consistentes entre tasks.

## Processo de execução

Worktrees isoladas + SDD (implementer → spec review → code-quality review → merge autônomo). Wave 1 solo; Wave 2 paralelo (Task 3‖4); Wave 3 paralelo (Task 5‖6‖7) depois Task 8 solo. Merge em main, push dispara CI+deploy Cloudflare. Sem `Co-Authored-By`.
