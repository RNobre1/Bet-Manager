# Task: Painéis Server (A, D, E, I, J, M, N)

> **Session:** Terminal 4 of 10 · **Branch:** `feat/dashboard-stats-T4` · **Status:** `[ ] Planning`

## Objective

Implementar os 7 painéis que são Server Components (render puro de dados pré-computados): A · team_record, D · h2h, E · splits 1H/2H, I · referee (opt), J · predictions (opt), M · distribuições (boxplot CSS), N · insights estatísticos. Cada um com test render + edge cases.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 fornece types + derivers; T2 fornece insights engine; T3 fornece StatsLayout (este task NÃO toca layout, só preenche slots via prop).
- **Decisões:** signatures em §3 do design; "opt" painéis retornam `null` quando dados vazios.

## Files ALLOWED

```
components/fixtures/stats/panels/team-record.tsx
components/fixtures/stats/panels/h2h.tsx
components/fixtures/stats/panels/splits-1h-2h.tsx
components/fixtures/stats/panels/referee.tsx
components/fixtures/stats/panels/predictions.tsx
components/fixtures/stats/panels/distributions.tsx
components/fixtures/stats/panels/insights.tsx
components/charts/form-bar.tsx
+ all corresponding .test.tsx
app/(dashboard)/fixtures/[id]/stats/page.tsx     (apenas adicionar imports + plugar nos panels props, sem refactor)
```

## Files FORBIDDEN

```
components/fixtures/stats/panels/momentum-chart.tsx        (T5)
components/fixtures/stats/panels/recent-matches.tsx        (T5)
components/fixtures/stats/panels/radar-comparison.tsx      (T5)
components/fixtures/stats/panels/scatter-playground.tsx    (T5)
components/fixtures/stats/panels/streaks-heatmap.tsx       (T6)
components/fixtures/stats/panels/players.tsx               (T6)
components/fixtures/stats/panels/markets-browser.tsx       (T7)
components/fixtures/stats/stats-layout.tsx                  (T3 owns)
components/fixtures/stats/hero.tsx                          (T3 owns)
lib/fixtures/stats/**                                        (T1/T2 own)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Escrever testes por painel em `.test.tsx` files: happy path + empty/null fallback.
- [ ] `pnpm test components/fixtures/stats/panels` — vermelho.
- [ ] `git commit -m "test: server panels render scenarios"`

### Phase 2 — GREEN

- [ ] Cada painel implementa props da signature em §3 do overview:
  - **A · team-record** — exibe points, PPG, position (parsed ordinal), GD, form via `<FormBar>` reverted, splits comparison home-vs-overall.
  - **D · h2h** — mini timeline horizontal de até 5 placards + agregado textual (X-Y-Z, gols somados, BTTS count).
  - **E · splits-1h-2h** — 6 bar rows CSS (gols/corners/cards × 1H/2H) com `--color-vermelho` fill proporcional ao max.
  - **I · referee** — retorna `null` se `record === null`; senão exibe nome, avg total BP grande (vermelho se >45), splits home/away, total_yellow_reds.
  - **J · predictions** — retorna `null` se array vazio; senão lista ordenada por `chance` DESC com chip "X% over 8.5 corners" + best_odds + bullets `home_stats`/`away_stats`.
  - **M · distributions** — para cada stat key (goals_ft, corners, BP, SOT, cards), boxplot CSS custom (whisker + box + median line); home/away lado a lado.
  - **N · insights** — itera array de Insight (vindo de T2's `rankInsights`), renderiza cards com border-left vermelha, ícone por kind, headline grande + text pequeno.
- [ ] Criar `<FormBar>` em `components/charts/form-bar.tsx` — recebe `results: ('W'|'D'|'L')[]` newest-first; render 5 quadrinhos colored (success/muted/vermelho).
- [ ] Plugar todos os panels no page.tsx via prop `panels={[{id:'A', element:<TeamRecord ... />, ...}]}`.
- [ ] `git commit -m "feat: server panels (A,D,E,I,J,M,N)"`

### Phase 3 — REFACTOR

- [ ] `<PanelShell>` shared se houver padding/border/title repetidos.
- [ ] `git commit -m "refactor: panel shell"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm dev` — abrir página, ver 7 painéis renderizando.

## Acceptance criteria

- [ ] 7 painéis exportados; 1 chart component (form-bar) exportado.
- [ ] Painéis opt retornam `null` quando dados vazios (verificado em test).
- [ ] Boxplots respeitam tokens: home `--color-vermelho`, away `--color-depth`.
- [ ] Coverage component ≥80% (vitest coverage report).

## Test scenarios

```
team-record
  - renders points/PPG/position/GD
  - form bar shows newest result first
  - hides splits comparison when overall and home identical

h2h
  - empty matches → "nenhum confronto direto"
  - 5 matches rendered as timeline
  - aggregate shows home-wins/draws/away-wins counts

splits-1h-2h
  - 6 rows render (3 stats × 2 halves)
  - bar widths proportional to max

referee
  - record=null → renders null
  - record present → shows name + avg BP

predictions
  - array=[] → renders null
  - array w/ 2 entries → both rendered ordered by chance DESC

distributions
  - boxplot renders for each stat key
  - min/q1/median/q3/max positioned correctly

insights
  - empty array → renders null
  - 6 insights → 6 cards in order
  - icon varies by kind (correlation/trend/pattern/outlier)
```

## Blockers

- T1/T2/T3 não merged → não dá pra começar.
- recharts version mismatch → não atualizar lib sem ADR.

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: boxplot CSS puro vs visx — CSS é zero KB e suficiente pra v1.
