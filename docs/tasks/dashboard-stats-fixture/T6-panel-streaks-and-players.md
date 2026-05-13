# Task: Painéis Client interativos (F streaks, G+ players)

> **Session:** Terminal 6 of 10 · **Branch:** `feat/dashboard-stats-T6` · **Status:** `[ ] Planning`

## Objective

Implementar os 2 painéis com filtros interativos: F · streaks heatmap (chips de 10 grupos + slider `overall_perc` + ⌘K cmdk + virtualizer com TanStack Virtual + CSS Grid heatmap) e G+ · players (ranking por critério configurável + mini scatter min×eficiência via recharts).

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 fornece deriveStreakIndex + derivePlayerRankings. T3 fornece StatsLayout. Filtros mexem URL via `useRouter().replace(...)` — querystring keys em §4 do overview.

## Files ALLOWED

```
components/fixtures/stats/panels/streaks-heatmap.tsx
components/fixtures/stats/panels/players.tsx
+ corresponding .test.tsx
app/(dashboard)/fixtures/[id]/stats/page.tsx     (apenas adicionar imports + plug; sem refactor)
```

## Files FORBIDDEN

```
all other panel files                              (T4, T5, T7)
components/fixtures/stats/{stats-layout,hero}.tsx (T3)
lib/fixtures/stats/**                              (T1)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Tests: chip toggle, slider update, cmdk fuzzy filter, virtualizer scroll, scatter render.
- [ ] `pnpm test components/fixtures/stats/panels` — vermelho.
- [ ] `git commit -m "test: streaks + players panels"`

### Phase 2 — GREEN

- [ ] **F · streaks-heatmap** — `"use client"`. 3 camadas:
  - **Chips** dos 10 grupos no topo (horizontal scroll mobile). Multi-select via Set state. Click → toggle. URL update via `useSearchParams + router.replace` (sem scroll).
  - **Slider** Radix-UI sobre `overall_perc` (0-100, step 5, default 60). URL update.
  - **⌘K cmdk** — search textual `stat_type + desc`. Modal Radix-Dialog.
  - **Heatmap CSS Grid** abaixo dos filtros: cada streak = 1 cell com `background-color: hsl(0, X%, Y%)` derivado de `overall_perc`. Hover mostra tooltip com stat_type, % home/away, count.
  - **Lista virtualizada** abaixo do heatmap (top streaks ordenados por overall_perc DESC), TanStack Virtual habilitado incondicionalmente.
  - **Botão "limpar filtros"** quando ≥1 filtro ativo.
  - **Empty state** "Nenhuma streak ≥ X% nos grupos selecionados — limpar filtros".
- [ ] **G+ · players** — `"use client"`:
  - 5 chips de critério (goals, cards, first_cards, sot, assists). Default "goals".
  - URL key `player_rank`. Top 5 home + top 5 away renderizados como rows com nome + valor grande.
  - Status `injured: true` → ícone red.
  - Mini scatter abaixo: X=minutos, Y=(goals+assists)*90/minutes. recharts ScatterChart, dots colored por side.
- [ ] `git commit -m "feat: streaks heatmap + players panels"`

### Phase 3 — REFACTOR

- [ ] Helper `useUrlState(key, default)` se 2+ filtros tiverem mesmo pattern.
- [ ] `git commit -m "refactor: useUrlState"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm dev` — filtros mexem URL, heatmap atualiza, cmdk abre com ⌘K.

## Acceptance criteria

- [ ] F: 3 camadas de filtro funcionais; URL mantém estado deep-link; virtualizer ativo.
- [ ] F: heatmap usa cores derivadas de overall_perc com `--color-vermelho`.
- [ ] G+: critério muda ranking; scatter atualiza com dots.
- [ ] Empty states implementados.
- [ ] Coverage ≥80%.

## Test scenarios

```
streaks-heatmap
  - default state: chips all unselected, slider=60, list shows all ≥60%
  - click chip "Goals" → URL has streaks=Goals, list filters
  - drag slider to 80 → URL min_perc=80, list shrinks
  - cmdk: type "btts" → list shows only BTTS-related streaks
  - "limpar filtros" → state resets

players
  - default rank=goals → top 5 by goals
  - click chip "cards" → top 5 by yellows+reds*2
  - injured player has icon
  - scatter renders 11+11 dots
```

## Blockers

- Radix slider não instalado → instalar `@radix-ui/react-slider` (peer-compat com Radix já no projeto). Avisar Pilot antes.
- cmdk modal pattern não existe no projeto → seguir padrão de `components/command-palette.tsx`.

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: virtualizer always-on (custo zero, future-proof) vs condicional (mais lean mas branchy).
