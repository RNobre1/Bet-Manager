# Task: bundle-analyzer + ADR + launch

> **Session:** Terminal 10 of 10 · **Branch:** `feat/dashboard-stats-T10` · **Status:** `[ ] Planning`

## Objective

Validar que o bundle ficou dentro do budget (+150 KB gzip max). Adicionar `@next/bundle-analyzer`, medir baseline (pre-T1 reverted) vs atual, escrever ADR no `CLAUDE.md`. Atualizar PROGRESS.md com snapshot final. Marcar 00-overview.md COMPLETED.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** TODOS os tasks anteriores merged.

## Files ALLOWED

```
package.json                                                                       (add @next/bundle-analyzer devDep)
next.config.ts                                                                     (wrap c/ analyzer quando ANALYZE=true)
CLAUDE.md                                                                          (add ADR + lessons learned)
docs/tasks/dashboard-stats-fixture/PROGRESS.md                                     (snapshot final)
docs/tasks/dashboard-stats-fixture/00-overview.md                                  (mark COMPLETED)
docs/tasks/dashboard-stats-fixture/state.json                                      (status=completed)
```

## Files FORBIDDEN

```
all production code
```

## Execution order

### Phase 1 — RED

_Não aplicável (task de instrumentation + docs, não muda comportamento)._

### Phase 2 — GREEN

- [ ] `pnpm add -D @next/bundle-analyzer`.
- [ ] Wrap `next.config.ts`:
  ```ts
  import bundleAnalyzer from "@next/bundle-analyzer";
  const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
  export default withBundleAnalyzer(nextConfig);
  ```
- [ ] `git stash` quaisquer changes, checkout `main`, `ANALYZE=true pnpm build` — capturar `report-baseline.html`.
- [ ] Voltar pra branch com T1-T9 merged, `ANALYZE=true pnpm build` — capturar `report-stats.html`.
- [ ] Compare: salvar resultados em `docs/tasks/dashboard-stats-fixture/bundle-report.md` (delta de gzip total + per chunk).
- [ ] Atualizar `PROGRESS.md` com métricas finais (bundle, coverage report, lighthouse score).
- [ ] Adicionar ADR ao `CLAUDE.md` na seção "Technical decisions":
  ```
  ADR-XXX: Dashboard de stats por fixture — visualização.
  Decision: recharts (sparkline/radar/scatter/ranking) + lightweight-charts v4 (séries temporais) + CSS Grid heatmap + Tailwind v4 container queries.
  Rejected: ECharts, Nivo, Chart.js, react-financial-charts, react-grid-layout, dnd-kit, react-window. DuckDB-WASM only em /explore.
  ...
  ```
- [ ] Adicionar "Lessons learned" novo no `CLAUDE.md` se durante execução surgiu algo (ex: lightweight-charts cleanup, recharts SSR, container query gotchas).
- [ ] Marcar `00-overview.md` header: `**Status:** COMPLETED on YYYY-MM-DD`.
- [ ] Atualizar `state.json` → `"status": "completed"`.
- [ ] `git commit -m "chore(stats): bundle baseline + ADR + launch"`

### Phase 3 — REFACTOR

_Não aplicável._

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`
- [ ] Open `/fixtures/<id-real>/stats` in production — smoke test manual.
- [ ] Confirmar bundle delta ≤ +150 KB gzip.

## Acceptance criteria

- [ ] Bundle delta documentado em `bundle-report.md`.
- [ ] ADR salvo em `CLAUDE.md`.
- [ ] PROGRESS.md final snapshot.
- [ ] 00-overview.md marcado COMPLETED.

## Test scenarios

_Sem unit tests novos. Validação manual + métrica de bundle._

## Blockers

- Bundle delta >150 KB → não-blocking se justificado mas registrar no PROGRESS.md.
- ANALYZE=true quebra build → não esperado; reverter wrap + investigar.

## Execution log
- Phase 1 (red): _n/a_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _n/a_
- Phase 4 (verification): _pending_

## Notes for review

- Bundle target conservador (+150 KB) — esperado 0-50 KB; sobra grande.
- ADR é único no CLAUDE.md — sem subdir docs/adrs/ por enquanto.
