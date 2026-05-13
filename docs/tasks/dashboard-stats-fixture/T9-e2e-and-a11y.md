# Task: Playwright E2E + axe-core a11y

> **Session:** Terminal 9 of 10 · **Branch:** `feat/dashboard-stats-T9` · **Status:** `[ ] Planning`

## Objective

Escrever tests integration (page-level com mock Supabase) + Playwright E2E (desktop + mobile happy paths) + axe-core a11y check zero-violation. Sem trocar a config de Playwright/vitest.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** TODOS os painéis (T3-T8) devem estar implementados e merged.

## Files ALLOWED

```
tests/integration/stats-page.test.tsx
tests/integration/stats-page-empty.test.tsx
tests/e2e/stats-page.spec.ts
tests/fixtures/detail-json/*.json                  (adicionar samples adicionais se necessário)
package.json                                        (apenas adicionar @axe-core/playwright se ausente)
```

## Files FORBIDDEN

```
todos os arquivos de produção (lib/, components/, app/, supabase/)
playwright.config.ts                                (não tocar)
vitest.config.ts                                    (não tocar)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Escrever `stats-page.test.tsx` (integration — mock Supabase admin): renderiza com fixture completo; renderiza opt panels quando dados; oculta opt panels quando vazios.
- [ ] Escrever `stats-page-empty.test.tsx`: `detail_json === null` → só hero + msg "em breve".
- [ ] Escrever `stats-page.spec.ts` (Playwright):
  - **desktop happy path**: visita `/fixtures/<id>/stats`, valida hero, 3 painéis-chave (streaks, players, momentum) visíveis, click chip "Goals" em F → URL contém `streaks=Goals`.
  - **mobile happy path**: viewport 360px, valida tabs, click "streaks" → painel monta.
  - **a11y check**: axe-core via `@axe-core/playwright` zero violations.
- [ ] `pnpm test:e2e --grep stats-page` + `pnpm test tests/integration` — vermelho (rotas/painéis precisam existir mas tests podem rodar).
- [ ] `git commit -m "test: stats page integration + e2e + a11y"`

### Phase 2 — GREEN

- [ ] Instalar `@axe-core/playwright` se ausente (single dep, run `pnpm add -D @axe-core/playwright` e atualizar lockfile).
- [ ] Garantir tests rodam verde (integration via vi.mock supabase, E2E via DB real local).
- [ ] `git commit -m "feat: e2e + a11y greens"`

### Phase 3 — REFACTOR

- [ ] Extrair `setupTestFixture()` helper se duplicação clara.
- [ ] `git commit -m "refactor: e2e helpers"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm test && pnpm test:e2e`
- [ ] CI passa (`.github/workflows/*` se existir).

## Acceptance criteria

- [ ] 2 integration tests verdes.
- [ ] 2 E2E spec verdes (desktop + mobile happy paths).
- [ ] axe-core zero violations.
- [ ] `pnpm test:e2e` adiciona spec ao runs.

## Test scenarios

```
integration: stats-page
  - renders 11 panels when full data
  - returns 404 on invalid id
  - omits referee panel when null
  - omits predictions panel when []
  - omits markets browser when {}

integration: stats-page-empty
  - detail_json null → hero shows "stats em breve"

e2e: stats-page desktop
  - navigate to /fixtures/<id>/stats
  - hero visible w/ kickoff
  - click chip "Goals" → URL=streaks=Goals
  - heatmap shrinks to Goals group only

e2e: stats-page mobile
  - viewport 360
  - tabs visible (não grid)
  - click "streaks" tab → painel ativo
  - axe-core 0 violations
```

## Blockers

- Banco de dev sem fixtures pra ID válido → fallback usar mock client em integration; E2E precisa rodar contra DB com pelo menos 1 fixture; instruir Pilot a ter dado de teste.

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: axe-core in CI vs apenas local — adicionar ao CI fica como follow-up.
