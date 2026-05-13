# Task: Insights engine

> **Session:** Terminal 2 of 10 · **Branch:** `feat/dashboard-stats-T2` · **Status:** `[ ] Planning`

## Objective

Implementar `lib/fixtures/stats/insights.ts` — computa correlações (sampleCorrelation via `simple-statistics`), tendências (regression linear via lib `regression`), padrões condicionais e outliers. Retorna top-N por confidence. 100% unit coverage.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 produz `derive.ts` + types — este task IMPORTA mas não modifica. T4 painel N consome o output.
- **Decisões já tomadas:** lista de insights e formato em research §6.5.
- **CLAUDE.md sections:** §testing-conventions.

## Files ALLOWED

```
lib/fixtures/stats/insights.ts
lib/fixtures/stats/insights.test.ts
```

## Files FORBIDDEN

```
app/**
components/**
lib/fixtures/stats/derive.ts              (T1, read-only via import)
lib/fixtures/stats/detail-json-types.ts   (T1, read-only via import)
supabase/**
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Escrever `insights.test.ts` cobrindo cada compute function.
- [ ] `pnpm test lib/fixtures/stats/insights` — vermelho.
- [ ] `git commit -m "test: insights engine scenarios"`

### Phase 2 — GREEN

- [ ] Implementar:
  - `computeCorrelations(matches): CorrelationInsight[]` — top correlações com |r| ≥ 0.5 entre pares de stats (SOT × goals, corners_1h × goals_ft, etc.). Limita top 10.
  - `computeTrends(matches): TrendInsight[]` — regression linear nos últimos 5 jogos vs últimos 10; slope ≥ |0.3 stat units / match| qualifies.
  - `computePatterns(detail, opponent_detail?): PatternInsight[]` — heurísticas condicionais: BTTS streak opo ≥70% + ref BP >45 ⇒ Z%; cards_1h média ≥0.5 + ref alto ⇒ outro Z%.
  - `computeOutliers(matches): OutlierInsight[]` — valores ≥ 2σ da média em cada stat (simple-statistics standardDeviation).
  - `rankInsights(all: Insight[], topN = 6): Insight[]` — sort por confidence DESC, dedup por kind.
- [ ] Tests verde. `git commit -m "feat: insights engine (corr/trend/pattern/outlier)"`

### Phase 3 — REFACTOR

- [ ] Helpers compartilhados (statKey enum, pearsonR wrapper).
- [ ] `git commit -m "refactor: insights helpers"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test lib/fixtures/stats/insights`

## Acceptance criteria

- [ ] 4 funções compute + rankInsights exportadas e tipadas.
- [ ] Coverage 100% em `insights.ts`.
- [ ] Cada insight inclui `kind`, `headline`, `text`, `confidence` (0..1).
- [ ] `rankInsights` retorna no máximo `topN`, ordenado por confidence DESC.

## Mandatory test scenarios

```
computeCorrelations
  - 0 matches → []
  - synthetic data with perfect r=1 SOT × goals → flagged
  - weak r < 0.3 → not flagged
  - duplicate pair (A,B) and (B,A) deduped

computeTrends
  - flat data → no trend
  - synthetic +0.5 goals/match slope → flagged with positive direction
  - synthetic -0.5 → flagged negative

computePatterns
  - no streaks → empty
  - BTTS streak 80% + ref BP 60 → pattern flagged with high confidence
  - missing referee_record → patterns that depend on ref skipped silently

computeOutliers
  - normal data (all within 1σ) → []
  - one match with goals_ft=8 in series averaging 1.5 → outlier flagged

rankInsights
  - mixed insights → returns topN sorted by confidence DESC
  - dedupes by kind+headline
```

## Blockers

- T1 ainda não mergeado (derivers indisponíveis) → não dá pra começar; aguardar.
- `simple-statistics` ou `regression` quebrados → avisar (não trocar lib sem ADR).

## Execution log

- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## State on pause

- Done: —
- In progress: —
- Exact next step: aguardar T1, então escrever scenarios em insights.test.ts

## Notes for review

- Trade-offs: thresholds (r ≥ 0.5, slope ≥ 0.3, 2σ) são conservadores — preferi false negatives a noise.
- Deferred: insights cross-fixture (comparar com league avg) — fora do scope v1, precisa DB query.
