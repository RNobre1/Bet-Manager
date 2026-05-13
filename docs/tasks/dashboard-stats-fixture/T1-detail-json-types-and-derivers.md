# Task: TS types + funções puras de derivação

> **Session:** Terminal 1 of 10 · **Branch:** `feat/dashboard-stats-T1` · **Status:** `[ ] Planning`

## Objective

Materializar TypeScript types do `detail_json` (refletindo `docs/pesquisas/detail-json-inventario.md`) e funções puras de derivação (deriveTeamRecord, deriveRecentMatchStats, deriveSplits1h2h, deriveStreakIndex, derivePlayerRankings, deriveOddsCategories, deriveDistributions, deriveRadarAxes). 100% cobertura unit via vitest.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **What other sessions are doing:** T2 (insights) e T3 (page skeleton) iniciam após este; ambos importam de `lib/fixtures/stats/detail-json-types.ts`.
- **Decisões já tomadas:** veja research `docs/pesquisas/dashboard-stats-fixture-arquitetura.md` §10 e data dictionary `docs/pesquisas/detail-json-inventario.md`.
- **CLAUDE.md sections:** §methodology, §testing-conventions, §commit-conventions (sem Co-Authored-By).

## Files ALLOWED to touch

```
lib/fixtures/stats/detail-json-types.ts
lib/fixtures/stats/derive.ts
lib/fixtures/stats/derive.test.ts
tests/fixtures/detail-json/epl-chelsea-tottenham.json
tests/fixtures/detail-json/brazil-serieB-noref.json
tests/fixtures/detail-json/liga-mx-with-predictions.json
```

## Files FORBIDDEN

```
app/**
components/**
lib/fixtures/stats/insights.ts            (T2)
lib/fixtures/stats/insights.test.ts       (T2)
supabase/**
docs/pesquisas/**                          (read-only; só consultar)
```

## Execution order (TDD mandatory)

### Phase 1 — RED

- [ ] Criar `tests/fixtures/detail-json/epl-chelsea-tottenham.json` baixando da DB Supabase (fixture id=2216) — gravar `detail_json` cru.
- [ ] Criar 2 fixtures adicionais: `brazil-serieB-noref.json` (sem `referee_record`/`odds_summary`) e `liga-mx-with-predictions.json` (com `predictions` populado).
- [ ] Escrever `derive.test.ts` com cenários da seção "Test scenarios" abaixo. Rodar `pnpm test lib/fixtures/stats` — vermelho com erro de import (esperado).
- [ ] `git commit -m "test: derivers + types contract"`

### Phase 2 — GREEN

- [ ] Criar `detail-json-types.ts` espelhando os 9 sections do inventário. Marcar opcionais (`referee_record: RefereeRecord | null`, `predictions: Prediction[]`, `trends: unknown[]`).
- [ ] Implementar derivers em `derive.ts`:
  - `deriveTeamRecord(raw): TeamRecordDerived | null` — parse + reverter `form` array pra newest-first.
  - `deriveRecentMatchStats(raw, perspectiveTeam: string): NormalizedRecentMatch[]` — extrai stats por jogo, marca `is_home` baseado em comparison com `home_team`/`away_team`.
  - `deriveSplits1h2h(matches): Splits1h2h` — médias 1H/2H de goals, corners, cards, SOT.
  - `deriveStreakIndex(raw): StreakIndex` — sorted overall_perc DESC, indexed por group.
  - `derivePlayerRankings(raw, criterion: 'goals' | 'cards' | 'first_cards' | 'sot' | 'assists'): Player[]`.
  - `deriveOddsCategories(raw): OddsCategoryMap` — agrupa 39 mercados em 6 categorias (match, halves, teams, corners, cards, player-props).
  - `deriveDistributions(matches): Record<StatKey, BoxStats>` — {min, q1, median, q3, max} usando `simple-statistics`.
  - `deriveRadarAxes(home, away): RadarData` — normaliza 6 axes (gols/jogo, gols sofridos, SOT, BP, corners, fouls).
- [ ] Tests verde. `git commit -m "feat: detail_json types + derivers puros"`

### Phase 3 — REFACTOR

- [ ] Extrair helpers de parsing comuns (parseOrdinal, safeNumber, safeArray).
- [ ] Lint + typecheck.
- [ ] `git commit -m "refactor: derive helpers"` (se aplicável).

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test lib/fixtures/stats`
- [ ] `git diff --stat main..HEAD` — apenas arquivos do ALLOWED list.

## Acceptance criteria

- [ ] Todos os 8 derivers implementados, exportados, tipados.
- [ ] `derive.test.ts` ≥ 30 cenários cobrindo: happy path (EPL), missing referee, empty odds, populated predictions, malformed input, edge cases (form com <5 entries, recent_matches.length=0).
- [ ] Coverage 100% para `derive.ts` (assert via vitest coverage report).
- [ ] `detail-json-types.ts` cobre TODOS os 9 sections do inventário; opcionais marcados explicitamente.

## Mandatory test scenarios

```
deriveTeamRecord
  - returns null for null/undefined/non-object input
  - parses EPL fixture (Chelsea team_record.home with home + overall splits)
  - reverts form array (oldest→newest in raw becomes newest→oldest in output)
  - parses ordinal position ("9th" → 9, "22nd" → 22, "1st" → 1)
  - handles missing fields gracefully (e.g. position absent → null)

deriveRecentMatchStats
  - returns [] for empty/missing recent_matches
  - normalizes 10 matches per side
  - marks is_home correctly based on home_team comparison
  - preserves 1h/2h splits for goals + corners + cards
  - filters status !== "FT" silently

deriveSplits1h2h
  - returns NaN-free averages (defaults to 0 when matches empty)
  - separates 1H vs 2H goals correctly (homeGoalsHt vs homeGoalsFt - homeGoalsHt)

deriveStreakIndex
  - 0 streaks → empty index
  - sorts by overall_perc DESC within each group
  - groups all 10 known streak.group values

derivePlayerRankings
  - ranks by goals (default) DESC
  - ranks by cards (yellows + reds*2) DESC
  - ranks by first_cards DESC
  - empty top_players → []

deriveOddsCategories
  - empty odds_summary → empty map
  - groups EPL 39 markets into 6 categories
  - unknown market goes to "other" bucket

deriveDistributions
  - computes min/q1/median/q3/max using simple-statistics
  - handles single-match input (degenerate distribution)

deriveRadarAxes
  - 6 axes returned
  - values normalized to 0..max scale
```

## Blockers — stop and alert

- DB unreachable to fetch sample fixtures → uso de fixtures pré-gravadas é OK temporário, mas avisar.
- Conflito com mudanças concorrentes em `lib/fixtures/` (qualquer arquivo) → não resolver, alertar.
- Test runner config quebrado → não mexer, alertar (T1 não inclui mudança em vitest.config.ts).

## Execution log

> Preencher durante execução. Cada phase com hash do commit.

- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

### Incidents / deviations

_(filled during execution)_

## State on pause

- Done: —
- In progress: —
- Exact next step: começar Phase 1, baixar fixtures via REST API do Supabase
- Tests: 0 passing, ~30 pending

## Notes for review

- Trade-offs: parser tolerante (retorna null em vez de throw) vs strict (zod) — escolhi tolerante pra resiliência (UI esconde painel ao invés de quebrar).
- Deferred: zod runtime guard — pode entrar em T2 ou T9.
- Known risks: choistats pode mudar shape de algum sub-campo no futuro — tests precisam ser atualizados.
