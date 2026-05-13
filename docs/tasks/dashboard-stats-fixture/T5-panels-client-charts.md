# Task: Painéis Client (B, C+, K, L) — charts

> **Session:** Terminal 5 of 10 · **Branch:** `feat/dashboard-stats-T5` · **Status:** `[ ] Planning`

## Objective

Implementar os 4 painéis Client baseados em charts: B · momentum (lightweight-charts canvas), C+ · recent matches multi-series (recharts LineChart toggle), K · radar comparativo (recharts RadarChart 6-axis), L · scatter playground (recharts ScatterChart + regression). Plus o helper `<TimeSeriesLine>` reutilizável.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 fornece types/derivers; T3 fornece StatsLayout (panels plugados aqui via prop). Bundle target: +35 KB gzip máx adicional sobre lightweight-charts já no bundle.

## Files ALLOWED

```
components/fixtures/stats/panels/momentum-chart.tsx
components/fixtures/stats/panels/recent-matches.tsx
components/fixtures/stats/panels/radar-comparison.tsx
components/fixtures/stats/panels/scatter-playground.tsx
components/charts/time-series-line.tsx
+ all corresponding .test.tsx
app/(dashboard)/fixtures/[id]/stats/page.tsx     (apenas adicionar imports + plug nos panels; sem refactor)
```

## Files FORBIDDEN

```
components/fixtures/stats/panels/{team-record,h2h,splits-1h-2h,referee,predictions,distributions,insights}.tsx   (T4)
components/fixtures/stats/panels/{streaks-heatmap,players}.tsx                                                    (T6)
components/fixtures/stats/panels/markets-browser.tsx                                                              (T7)
components/fixtures/stats/{stats-layout,hero}.tsx                                                                 (T3)
lib/fixtures/stats/**                                                                                              (T1/T2)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Escrever tests por painel: happy path + interação básica (axis switch em L, stat toggle em C+, hover sync em B).
- [ ] `pnpm test components/fixtures/stats/panels` — vermelho.
- [ ] `git commit -m "test: client chart panels scenarios"`

### Phase 2 — GREEN

- [ ] **B · momentum-chart** — `"use client"`. Cria 1 chart lightweight-charts com 2 line series (home red, away blue depth). useEffect pra setupar + cleanup; useRef pro container. Tema dark — usar tokens (`--color-vermelho`, `--color-depth`).
- [ ] **C+ · recent-matches** — `"use client"`. recharts LineChart com toggle (4 chips: goals_ft, SOT, corners, BP). Trend line dashed via second `<Line>` com pre-computed regression. hover crosshair sync (recharts default).
- [ ] **K · radar-comparison** — `"use client"`. recharts RadarChart 6-axis (gols/jogo, gols sofridos, SOT, BP, corners, fouls). 2 `<Radar>` overlay (home/away). PolarGrid + axes labels.
- [ ] **L · scatter-playground** — `"use client"`. recharts ScatterChart com 2 selects (X stat / Y stat). Dots colored por side. Trend line via `regression.linear()` + segundo `<Line>`. Pearson r exibido no header via `simple-statistics.sampleCorrelation`.
- [ ] **TimeSeriesLine** helper — recharts LineChart genérico com props `series[]` + responsive container.
- [ ] Tests verde. `git commit -m "feat: client chart panels (B,C+,K,L)"`

### Phase 3 — REFACTOR

- [ ] Extrair tema escuro de tooltip recharts (reuse entre painéis).
- [ ] `git commit -m "refactor: chart tooltip theme"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm dev` — todos os charts renderizam, sem console errors.

## Acceptance criteria

- [ ] 4 painéis exportados com `"use client"` declarado.
- [ ] lightweight-charts cleanup em useEffect cleanup (sem memory leak).
- [ ] Scatter playground: selects X/Y funcionam, trend line atualiza.
- [ ] Radar mostra 6 axes, ambos times overlay.
- [ ] Recent matches: toggle de stat troca série + trend.
- [ ] Coverage component ≥80%.

## Test scenarios

```
momentum-chart
  - renders chart container after mount
  - empty series → renders "sem dados" fallback
  - cleanup runs on unmount

recent-matches
  - default toggle = goals_ft
  - click chip "SOT" → series changes
  - trend line visible

radar-comparison
  - 6 axes rendered
  - both teams polygons overlay

scatter-playground
  - default X=SOT, Y=goals_ft
  - changing X/Y updates dots
  - trend line + pearson r displayed
```

## Blockers

- recharts ResponsiveContainer não funciona no test runner → usar fixed width em tests.
- lightweight-charts canvas DOM API quebrada em happy-dom → mock library no test ou usar `vi.mock`.

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: lightweight-charts pra momentum só (1 painel) — overkill talvez; mas paga porque recharts SVG-per-point degrada em 10+ pontos.
