# Dashboard de Stats por Fixture — Progress

**Last update:** 2026-05-13

---

## Status por task

| Task | Status | Branch | PR | Hash | Notes |
|---|---|---|---|---|---|
| T1 | [ ] Pending | `feat/dashboard-stats-T1` | — | — | wave 1, foundation |
| T2 | [ ] Pending — blocked by T1 | `feat/dashboard-stats-T2` | — | — | wave 2 |
| T3 | [ ] Pending — blocked by T1 | `feat/dashboard-stats-T3` | — | — | wave 2 |
| T4 | [ ] Pending — blocked by T1, T2 | `feat/dashboard-stats-T4` | — | — | wave 3 |
| T5 | [ ] Pending — blocked by T1, T3 | `feat/dashboard-stats-T5` | — | — | wave 3 |
| T6 | [ ] Pending — blocked by T1, T3 | `feat/dashboard-stats-T6` | — | — | wave 4 |
| T7 | [ ] Pending — blocked by T1, T3 | `feat/dashboard-stats-T7` | — | — | wave 4 |
| T8 | [ ] Pending — blocked by T3-T7 | `feat/dashboard-stats-T8` | — | — | wave 5 |
| T9 | [ ] Pending — blocked by T8 | `feat/dashboard-stats-T9` | — | — | wave 6 |
| T10 | [ ] Pending — blocked by T9 | `feat/dashboard-stats-T10` | — | — | wave 6 |

> **Status syntax:** `[ ] Pending` → `[ ] Ready to dispatch` → `[x] Completed YYYY-MM-DD (#PR → hash)`.

---

## Métricas snapshot

| Métrica | Baseline | Atual | Target |
|---|---|---|---|
| Painéis renderizando | 0 | 0 | 11 |
| Bundle gzip rota /stats | (não medido) | — | ≤ +150 KB sobre baseline |
| Cobertura unit (derivers) | 0% | — | 100% |
| Cobertura unit (insights) | 0% | — | 100% |
| Cobertura component (painéis) | 0% | — | 80% |
| Cenários E2E | 0 | — | 2 (desktop + mobile) |
| Violations axe-core | n/a | — | 0 |
| Lighthouse Performance | — | — | ≥ 85 (target conservador) |

---

## Cronological log

### 2026-05-13

- 14:00 — Brainstorm iniciado (`/superpowers:brainstorming`).
- 14:02 — Research-cycle L2 disparado (`researcher` agent).
- 14:40 — Draft v0.1 do researcher entregue (22 fontes, 14 domínios).
- 14:55 — Research-critic adversarial (3 blocking + 5 must-fix).
- 15:00 — Verificação empírica direta no `node_modules` (lightweight-charts 51 KB gzip; DuckDB-WASM já usado em /explore; React Compiler NÃO habilitado).
- 15:15 — Draft v0.2 com correções inline, salvo em `docs/pesquisas/dashboard-stats-fixture-arquitetura.md` (status: completed).
- 15:20 — Data dictionary do `detail_json` escrito (`docs/pesquisas/detail-json-inventario.md`, 80 fixtures varridos).
- 15:30 — Design completo aprovado em 5 seções (anatomia + arquitetura + componentes + interações + testing).
- 15:45 — Task decomposition em 10 tasks + 6 waves de paralelização (este arquivo).

---

## Decisões registradas durante decomposição

1. **Doc level = `completo`** — feature multi-dia com paralelização explícita; justifica `tasks.json` + `state.json` + `TERMINAL-PROMPTS.md`.
2. **Wave 3 (T4 + T5) paralelo**: separação Server/Client garante que não haverá conflito de import nem render.
3. **Wave 4 (T6 + T7) paralelo**: F/G+ vs H tocam painéis distintos.
4. **T8 (mobile)** depende de TODOS os painéis estarem implementados — wave isolada.
5. **T9 + T10** sequenciais: launch precisa ter testes passando.
6. **NUNCA commits com `Co-Authored-By: Claude`** — regra global do user (CLAUDE.md).

---

## Sub-tasks descobertos (backlog)

> Estão aqui até virarem T-files formais.

| Sub-task | Origem | Descrição |
|---|---|---|
| (vazio até execução começar) | — | — |
