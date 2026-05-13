# Dashboard de Stats por Fixture — Subagent Prompts

> Prompts auto-contidos pra dispatching via `subagent-driven-development` (NÃO via terminais separados). Cada prompt está em **caveman mode full** (intensidade default) pra cortar ~75% dos tokens enquanto preserva precisão técnica. Model alvo: `sonnet` (Claude Sonnet 4.6).
>
> O **claude orchestrator** (este host) dispara os subagents via Agent tool com `model: "sonnet"` e `subagent_type: "general-purpose"` (ou outro caso apropriado, como `tdd` pra Phase 1 de cada task).

---

## Prefixo comum a TODOS os prompts

Inserir no topo de cada prompt antes da instrução específica:

```
Use caveman:caveman skill at full intensity.
Brief output. Tech right. Less word.
TDD mandatory. Tests first ALWAYS. Red -> Green -> Refactor.
NO Co-Authored-By: Claude in commits (pilot rule).
Read CLAUDE.md root + docs/tasks/dashboard-stats-fixture/00-overview.md before start.
Files ALLOWED in T-file. Files FORBIDDEN do not touch. Diff stat verify scope.
Open PR to main when green. NEVER self-merge.
```

---

## Wave 1 — T1 (foundation, solo)

**Agent type:** `tdd` (TDD-strict)
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T1-detail-json-types-and-derivers.md.
Execute it. Branch feat/dashboard-stats-T1.
Pull sample fixtures from Supabase REST (DB connection in .env.local).
30+ unit tests required. 100% coverage on derive.ts.
PR to main when green. No Co-Authored-By: Claude.
```

---

## Wave 2 — T2 + T3 (parallel)

### T2 — Insights engine

**Agent:** `tdd`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T2-insights-engine.md.
PRECONDITION: T1 PR merged (verifica via git log).
Execute. Branch feat/dashboard-stats-T2.
Import from T1's derive.ts + types. Use simple-statistics + regression libs (already installed).
100% coverage on insights.ts.
PR. No Co-Authored-By: Claude.
```

### T3 — Stats page skeleton

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T3-stats-page-skeleton.md.
PRECONDITION: T1 merged.
Execute. Branch feat/dashboard-stats-T3.
Create page.tsx + StatsLayout + Hero. Plug T1 derivers.
Test integration scenarios as in T-file.
Run pnpm dev, verify /fixtures/<id>/stats opens.
PR. No Co-Authored-By: Claude.
```

---

## Wave 3 — T4 + T5 (parallel)

### T4 — Server panels batch

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T4-panels-server-batch.md.
PRECONDITION: T1, T2, T3 merged.
Execute. Branch feat/dashboard-stats-T4.
Implement 7 Server panels (A, D, E, I, J, M, N) + FormBar.
Opt panels return null when data empty.
Plug into page.tsx via panels prop. Coverage 80%+ per panel.
PR. No Co-Authored-By: Claude.
```

### T5 — Client chart panels

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T5-panels-client-charts.md.
PRECONDITION: T1, T3 merged.
Execute. Branch feat/dashboard-stats-T5.
Implement 4 Client panels: B (lightweight-charts canvas), C+ (recharts LineChart toggle), K (recharts RadarChart), L (recharts ScatterChart + regression).
Plus TimeSeriesLine helper.
Cleanup lightweight-charts in useEffect cleanup. Mock canvas in tests.
PR. No Co-Authored-By: Claude.
```

---

## Wave 4 — T6 + T7 (parallel)

### T6 — Streaks + Players panels

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T6-panel-streaks-and-players.md.
PRECONDITION: T1, T3 merged.
Execute. Branch feat/dashboard-stats-T6.
Streaks heatmap: 3-layer filters (chips groups + slider overall_perc + cmdk fuzzy search).
URL sync via router.replace. TanStack Virtual always-on.
Players: 5 rank criteria chips + mini scatter (recharts).
PR. No Co-Authored-By: Claude.
```

### T7 — Markets browser

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T7-panel-markets-browser.md.
PRECONDITION: T1, T3 merged.
Execute. Branch feat/dashboard-stats-T7.
Markets browser drawer (Radix Dialog bottom-sheet mobile / modal desktop).
Return null when odds_summary empty. 6 category chips.
PR. No Co-Authored-By: Claude.
```

---

## Wave 5 — T8 (solo, post-panels)

### T8 — Mobile responsive

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T8-mobile-tabs-responsive.md.
PRECONDITION: T3, T4, T5, T6, T7 merged.
Execute. Branch feat/dashboard-stats-T8.
Add Radix Tabs in StatsLayout when viewport <768px.
Refine container queries per panel (heatmap overflow-x-auto, etc.).
DevTools verify 360/480/768/1024/1440 px. No layout breaks.
PR. No Co-Authored-By: Claude.
```

---

## Wave 6 — T9 then T10 (sequential)

### T9 — E2E + a11y

**Agent:** `tdd`
**Model:** `sonnet`

```
Caveman mode full. Less word. TDD strict.
Read docs/tasks/dashboard-stats-fixture/T9-e2e-and-a11y.md.
PRECONDITION: T8 merged.
Execute. Branch feat/dashboard-stats-T9.
2 integration tests (vitest + happy-dom + vi.mock supabase).
2 Playwright E2E (desktop + mobile happy paths).
Add @axe-core/playwright if missing. Zero violations.
PR. No Co-Authored-By: Claude.
```

### T10 — Bundle + ADR + launch

**Agent:** `general-purpose`
**Model:** `sonnet`

```
Caveman mode full. Less word. Doc + measurement task.
Read docs/tasks/dashboard-stats-fixture/T10-bundle-and-launch.md.
PRECONDITION: T9 merged.
Execute. Branch feat/dashboard-stats-T10.
Add @next/bundle-analyzer. Compare main baseline vs feature branch.
Write bundle-report.md. Update CLAUDE.md with ADR + lessons learned.
Mark 00-overview.md COMPLETED. Update state.json.
PR. No Co-Authored-By: Claude.
```

---

## Orchestrator dispatch flow (claude-host responsibility)

> Quando o Pilot der OK pra começar a execução, o claude orchestrator usa `Agent({ subagent_type, model: "sonnet", prompt })` pra cada task seguindo as waves.
>
> **NUNCA disparar a próxima wave antes de TODOS os tasks da wave atual estarem com PR merged.**
>
> **Não dispare T2 e T3 simultaneamente sem confirmar que T1 já mergeou.**

| Wave | Comando orchestrator (alto nível) | Bloqueio |
|---|---|---|
| 1 | dispatch T1 (sync; espera completar) | — |
| 2 | dispatch T2 + T3 em paralelo (Agent calls juntos) | T1 PR merged |
| 3 | dispatch T4 + T5 em paralelo | T2, T3 PRs merged |
| 4 | dispatch T6 + T7 em paralelo | T1, T3 PRs merged |
| 5 | dispatch T8 (sync) | T3-T7 PRs merged |
| 6 | dispatch T9 sync → dispatch T10 sync | T8 → T9 |

---

## Coordenação

- Cada agent abre PR separado pro main.
- **PRs não são self-merge** — Rafael revisa cada um, mergea quando satisfeito, e só então a próxima wave dispara.
- Conflict prevention: cada wave toca **arquivos distintos** (verificado nas tabelas FORBIDDEN dos T-files).
- Se um agent reportar blocker, claude orchestrator aborta a wave e reporta ao Pilot.
- Caveman mode em todo subagent + reasoning interno bilíngue PT/EN ok; mensagens de commit em pt-BR (Conventional Commits).

---

## Stop conditions

- Agent crash mid-task → claude orchestrator não retoma; reporta ao Pilot pra decidir resume ou rollback.
- Test failure persistente após 3 tentativas do mesmo Phase → abort, reportar.
- Lint/typecheck failure → corrigir, não pular.
- Necessidade de mexer em FORBIDDEN file → blocker, alertar Pilot.
