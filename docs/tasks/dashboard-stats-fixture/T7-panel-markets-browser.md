# Task: Painel H · markets browser (drawer Radix, opt)

> **Session:** Terminal 7 of 10 · **Branch:** `feat/dashboard-stats-T7` · **Status:** `[ ] Planning`

## Objective

Implementar painel H · markets browser — drawer Radix Dialog que abre uma view scrollável com os 0-39 mercados de `odds_summary`, agrupados em 6 categorias (match, halves, teams, corners, cards, player-props). Retorna `null` quando `odds_summary` vazio.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 fornece deriveOddsCategories.

## Files ALLOWED

```
components/fixtures/stats/panels/markets-browser.tsx
components/fixtures/stats/panels/markets-browser.test.tsx
app/(dashboard)/fixtures/[id]/stats/page.tsx     (apenas plug; sem refactor)
```

## Files FORBIDDEN

```
all other panel files
components/fixtures/stats/{stats-layout,hero}.tsx
lib/fixtures/stats/**
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Tests: empty odds → null; populated → button rendered; click → drawer opens; category chips toggle visible group.
- [ ] `pnpm test components/fixtures/stats/panels/markets-browser` — vermelho.
- [ ] `git commit -m "test: markets browser"`

### Phase 2 — GREEN

- [ ] `"use client"`:
  - Renderiza painel inline com 1 botão "ver todos os mercados (N)" + 4-6 cards de mercados-headline pré-selecionados (Result 1X2, BTTS, Match Goals O/U 2.5, Total Cards Over 5.5).
  - Click no botão abre `@radix-ui/react-dialog` (Drawer-like) bottom sheet mobile / modal centered desktop.
  - Drawer interior: 6 chips de categoria + lista de mercados expandida da categoria selecionada.
  - Cada market entry: nome do mercado + lista de outcomes com `bookmaker` + `decimal_odds`.
  - Filter URL param `markets_cat` quando categoria expandida.
- [ ] Returna `null` quando `Object.keys(odds_summary).length === 0`.
- [ ] `git commit -m "feat: markets browser drawer"`

### Phase 3 — REFACTOR

- [ ] Component `<MarketCard>` se card repetido.
- [ ] `git commit -m "refactor: MarketCard"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm dev` — drawer abre/fecha, ESC funciona, mobile bottom sheet.

## Acceptance criteria

- [ ] Painel é `null` quando dados ausentes.
- [ ] Drawer ARIA correto (role=dialog, aria-label).
- [ ] 6 chips de categoria visíveis.
- [ ] ESC + click fora fecham drawer.

## Test scenarios

```
markets-browser
  - empty odds_summary → returns null
  - 39 markets in EPL fixture → button "ver todos (39)" rendered
  - click button → drawer opens
  - drawer has 6 category chips
  - click "player-props" chip → list shows only player-props markets
  - ESC closes drawer
```

## Blockers

- @radix-ui/react-dialog não instalado? — já está em `package.json` (verificado).

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: dialog bottom-sheet vs Sheet primitive — Radix Dialog suficiente.
