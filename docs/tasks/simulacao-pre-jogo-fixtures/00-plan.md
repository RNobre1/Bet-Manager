# Simulação Pré-Jogo de Fixtures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Waves desenhadas para execução paralela em **worktrees isolados** (`.worktrees/<slug>`, node_modules symlinkado da main — ver [[abissal-gate-gotchas]]).

**Goal:** Simulação pré-jogo pré-computada por fixture (placar + todas as stats por time/tempo + camada por jogador com provável escalação), exibida no dashboard, calibrada, sem reabrir a outage 1101 do Worker.

**Architecture:** Tudo computado no **scraper Ruby** pós-persist do `detail_json`; Worker só lê escalares. Modelo: força ataque/defesa de temporada (`*Avgs`) normalizada pela liga → Poisson + correção Dixon-Coles τ; Negative Binomial p/ stats overdispersas; Monte Carlo 10k → escalares; alocação de eventos por jogador. Schema `fixture_simulations` próprio. Fundação compartilhada: enriquecer `WidgetMerger` (beneficia também o dashboard de stats existente).

**Tech Stack:** Ruby (scraper, RSpec), Supabase Postgres (SQL migration), Next.js 16 App Router (RSC), TypeScript, Vitest.

**Spec:** `docs/pesquisas/simulacao-pre-jogo-fixtures.md` (L3, v0.3 aprovada c/ ressalvas pelo research-critic real).

> Migration numbering: número FIXADO em **`0018`** para `fixture_simulations` (próximo livre após `0017_fixture_badges.sql`). Wave 1 (fundação) **não tem migration** — só enriquece o jsonb `detail_json` existente. Outras migrations não são necessárias.

---

## Waves & Paralelização (mapa de execução)

| Wave | Task | Depende de | Worktree / arquivos (disjuntos) |
|---|---|---|---|
| **0** | T0 — POC empírico (Lição #2) | — (lê API/sample, não precisa de persist) | `wt-poc`: `scripts/poc/` + `docs/tasks/simulacao-pre-jogo-fixtures/01-poc-findings.md` |
| **1** | T1 — Fundação: enriquecer `WidgetMerger` (6 itens) | — (**gate** das waves 2+) | `wt-fundacao`: `scripts/scraper/lib/scraper/widget_merger.rb` (+ spec) |
| **2a** | T2 — Simulação + migration `0018` + hook no orchestrator | T1; consome params de T0 | `wt-sim`: `scripts/scraper/lib/scraper/simulation/**` + `0018` + orchestrator |
| **2b** | T3 — Dashboard turbinado (consome campos novos) + repository de leitura `fixture_simulations` | T1 (campos novos); T2 (schema p/ ler sim) | `wt-dash`: `app/(dashboard)/**`, `lib/fixtures/simulation-repository.ts` (+ tests) |
| **3a** | T4 — Calibração + `brierScore` + reconciler irmão + `/calibracao` | T2 (`fixture_simulations`) | `wt-calib`: `lib/ai/calibration-metrics.ts`, `scripts/scraper/lib/scraper/simulation_reconciler.rb`, `app/(dashboard)/calibracao/**` (+ tests) |
| **3b** | T5 — Guard de payload generalizado | T2/T3 (módulo de leitura novo existe) | `wt-guard`: `lib/fixtures/repository-payload-guard.test.ts` |
| **4** | T6 — Gate final + ADR-006 + Lição B15 | todas | main (pós-merges) |

**Paralelismo real:** T0 ‖ T1 (independentes). Depois T1 mergeado → **T2a ‖ T2b** (Ruby+SQL vs TS/React, arquivos disjuntos). Depois T2 mergeado → **T3a ‖ T3b**. Merge `--no-ff` sequencial; gate combinado (RSpec + Vitest + lint + typecheck) a cada merge. Padrão idêntico ao das 3 features de [[three-features-shipped]].

---

## File Structure

- Create: `scripts/poc/numatches_baseline_probe.rb` — script one-off do POC (T0); **não** vai pro hot path.
- Create: `docs/tasks/simulacao-pre-jogo-fixtures/01-poc-findings.md` — números medidos (ρ/k iniciais, distribuição `numMatches`, ruído baseline-dia, `outcomeOdds` preenchido?).
- Modify: `scripts/scraper/lib/scraper/widget_merger.rb` — persistir 6 itens de fundação.
- Modify: `scripts/scraper/spec/scraper/widget_merger_spec.rb` (ou criar se não existir) — specs RED→GREEN da fundação.
- Create: `scripts/scraper/lib/scraper/simulation/rates.rb` — derivação de λ/μ + shrinkage condicional (puro).
- Create: `scripts/scraper/lib/scraper/simulation/score_model.rb` — Poisson + correção Dixon-Coles τ (puro).
- Create: `scripts/scraper/lib/scraper/simulation/secondary_stats.rb` — Negative Binomial por métrica (puro).
- Create: `scripts/scraper/lib/scraper/simulation/player_allocation.rb` — provável XI + alocação de eventos (puro).
- Create: `scripts/scraper/lib/scraper/simulation/monte_carlo.rb` — motor 10k → escalares.
- Create: `scripts/scraper/lib/scraper/simulation/runner.rb` — orquestra os módulos a partir de um `detail_json`, devolve o hash escalar.
- Create: `scripts/scraper/spec/scraper/simulation/*_spec.rb` — specs por módulo.
- Create: `supabase/migrations/0018_fixture_simulations.sql` — tabela própria (escalar + jsonb pequeno), RLS service-role-only, sem FK rígida.
- Modify: `scripts/scraper/lib/scraper/orchestrator.rb` — hook: após persist do detail, computar+persistir simulação (warning-safe).
- Create: `lib/fixtures/simulation-repository.ts` — leitura **só escalar** de `fixture_simulations` p/ o dashboard.
- Create: `lib/fixtures/simulation-repository.test.ts`.
- Modify: `app/(dashboard)/**` — exibir simulação (campo + aba stats + tooltips; "provável escalação" rotulada) e os campos novos de fundação no dashboard de stats existente.
- Modify: `lib/ai/calibration-metrics.ts` + `lib/ai/calibration-metrics.test.ts` — `brierScore` NOVO.
- Create: `scripts/scraper/lib/scraper/simulation_reconciler.rb` (+ spec) — irmão do reconciler, resolve `fixture_simulations`.
- Modify: `app/(dashboard)/calibracao/**` — aba "simulação" (Brier).
- Modify: `lib/fixtures/repository-payload-guard.test.ts` — glob `lib/**/*repository*.ts`.

---

## Task 0 (Wave 0): POC empírico — Lição #2

**Files:** Create `scripts/poc/numatches_baseline_probe.rb`, `docs/tasks/simulacao-pre-jogo-fixtures/01-poc-findings.md`. Forbidden: tudo em `scripts/scraper/lib/`, `app/`, `lib/`, `supabase/`.

**Objetivo:** Confirmar/calibrar antes de a T2 hard-codar parâmetros. Não fecha arquitetura (já fechada no spec) — calibra.

- [ ] **Step 1:** Script Ruby que, para uma amostra de fixtures (usar os fixtures de `scripts/scraper/spec/scraper/fixtures/widgets/*.json` + se possível N respostas reais do `recent-results`/`players` da API choistats já cacheadas), mede: distribuição de `numMatches` dos 4 blocos `*Avgs` (min/p25/mediana/p75/max por liga); nº de times por liga no recorte de um dia típico (ruído da baseline-dia); se `outcomeOdds` por jogador vem preenchido (`fixtureId != 0`).
- [ ] **Step 2:** Rodar; escrever `01-poc-findings.md` com: tabela de `numMatches`, decisão sobre fallback de baseline-dia (cair p/ baseline persistida se < N times — fixar N), valor inicial de `k` (shrinkage) e faixa de `ρ` ([−0.15,−0.05]) com a evidência, e veredito sobre `outcomeOdds`.
- [ ] **Step 3: Commit** — `docs(sim): POC empírico — numMatches/baseline-dia/outcomeOdds + ρ/k iniciais`.

**Acceptance:** `01-poc-findings.md` responde os 4 itens do §11 follow-up #1 do spec com números, não suposição.

## Task 1 (Wave 1 — GATE): Fundação — enriquecer `WidgetMerger`

**Files:** Modify `scripts/scraper/lib/scraper/widget_merger.rb` e seu spec. Forbidden: qualquer arquivo fora do scraper; nenhuma migration (jsonb `detail_json` já existe).

**Contexto:** o `WidgetMerger` hoje descarta dado que já vem na resposta dos widgets (spec §6.5 itens 1-6). Persistir tudo no `detail_json` (chaves novas, aditivas — não remover/renomear nada existente; `COALESCE`-safe no persister). Beneficia simulação **e** dashboard de stats existente.

- [ ] **Step 1: Specs falhando** (`widget_merger_spec.rb`) — dado os fixtures reais `recent-results.json`/`team-records.json`/`players.json`/`odds.json`, asserta que `merge` produz no `detail_json`:
  - `avgs: { home_home, home_overall, away_away, away_overall }` cada com as ~43 métricas + `num_matches` (item 1).
  - `recent_all: { home: [...], away: [...] }` de `recentHome/AwayAllResults` (item 2).
  - `standings: { home: {...}, away: {...} }` de `*ResultsWithStandings`+`Stage`+`fixtureWithoutStats` (item 3).
  - `goal_kicks`/`throw_ins` presentes em cada item de `recent_matches`/`h2h` (item 4 — adicionar a `RECENT_MATCH_FIELDS`).
  - `odds_devigged: { <market>: { <outcome>: prob } }` — devig **multiplicativo** `p_i=(1/o_i)/Σ(1/o_j)` por mercado, sobre os 52 mercados (item 5).
  - `player_extra: { form, home_seasons, away_seasons, outcome_odds_by_player }` de `playerStatsForm`/`homeTeamSeasons`/`awayTeamSeasons`/`outcomeOdds` (item 6).
  - **Regressão:** chaves antigas (`recent_matches`, `h2h`, `team_record`, `streaks`, `predictions`, `odds_summary`, `player_stats`, `referee_record`) **inalteradas** (asserta shape antigo lado a lado).
- [ ] **Step 2: Rodar e ver falhar** — `cd scripts/scraper && bundle exec rspec spec/scraper/widget_merger_spec.rb` → FAIL.
- [ ] **Step 3: Implementar** — novos `build_*` puros + chaves no `detail.with(...)`; devig multiplicativo helper; `RECENT_MATCH_FIELDS += %w[homeGoalKicks awayGoalKicks homeThrowIns awayThrowIns]`. Aditivo; zero mudança nas chaves existentes.
- [ ] **Step 4: Rodar e ver passar** — RSpec do widget_merger verde + suíte do scraper verde (`bundle exec rspec`).
- [ ] **Step 5: Commit** — `feat(scraper): WidgetMerger persiste avgs/recent_all/standings/goal_kicks/throw_ins/odds_devigged/player_extra (fundação simulação+dashboard)`.

**Acceptance:** 6 itens persistidos, chaves antigas intactas (regressão verde), devig somando ~1.0 por mercado.

## Task 2 (Wave 2a): Motor de simulação + `0018` + hook no orchestrator

**Files:** Create `scripts/scraper/lib/scraper/simulation/{rates,score_model,secondary_stats,player_allocation,monte_carlo,runner}.rb` + specs; Create `supabase/migrations/0018_fixture_simulations.sql`; Modify `scripts/scraper/lib/scraper/orchestrator.rb`. Forbidden: `widget_merger.rb`, `app/`, `lib/` (TS), `calibration-metrics.ts`.

**Contexto:** consome `detail_json` enriquecido por T1 e os parâmetros ρ/k de T0. Tudo puro/determinístico exceto o seed do MC (fixar seed nos testes).

- [ ] **Step 1: Specs falhando por módulo:**
  - `rates_spec.rb`: `Rates.lambdas(detail, league_avgs)` → `{home:, away:}` pela fórmula do spec §6.1 (números à mão); shrinkage condicional `w=num_matches/(num_matches+k)` só quando `num_matches < limiar` (limiar/k de `01-poc-findings.md`).
  - `score_model_spec.rb`: `ScoreModel.matrix(lambda_home, lambda_away, rho)` 0..N×0..N; correção DC nas 4 células `τ(0,0)=1−λμρ, τ(0,1)=1+λρ, τ(1,0)=1+μρ, τ(1,1)=1−ρ`; soma ≈ 1.0; `ρ=0` ⇒ Poisson puro (paridade).
  - `secondary_stats_spec.rb`: `SecondaryStats.sample(rng, mean, dispersion)` Negative Binomial; média empírica de N amostras ≈ mean; var > mean.
  - `player_allocation_spec.rb`: `PlayerAllocation.probable_xi(players)` exclui `injured:true`, rank `started + minutes/league_mpg`, top-11; `allocate_event(rng, xi, weights)` distribui ∝ `(goals/minutes)*exp_min`. Determinístico com rng seedado.
  - `monte_carlo_spec.rb`: `MonteCarlo.run(seed:, n:10_000, ...)` → escalares: `p_home/p_draw/p_away` (somam 1), `p_btts`, `p_over_25`, `top_scorelines` (≤6), `sim_stats` (p10/p50/p90 por métrica/time/tempo quando aplicável, `per_half_available`), `market_anchor`, `player_events` (por jogador: P(gol), gols esp., P(cartão), `provavel_titular`, confiança). Seed fixo ⇒ saída idêntica (reprodutível).
  - `runner_spec.rb`: `Runner.simulate(detail_json)` → hash escalar pronto p/ persistir; degrada (posse ausente ⇒ não emite; sem split HT ⇒ `per_half_available:false`); detail incompleto ⇒ `status:'unsimulable'` sem raise.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** os 6 módulos puros + `0018_fixture_simulations.sql` (colunas do spec §6.5: escalares + `top_scorelines/sim_stats/market_anchor/player_events jsonb` pequenos; `status check in ('pending','resolved','unsimulable','unresolvable')`; RLS service-role-only espelhando `0016`; sem FK rígida — sobrevive à purga, guarda `home_team/away_team/league/kickoff_utc`). Hook no `orchestrator.rb`: após persistir o detail, `Runner.simulate` → upsert em `fixture_simulations`, em bloco `rescue StandardError` que só loga warning (padrão Lição #11 — uma fixture problemática não derruba o scrape).
- [ ] **Step 4: Rodar e ver passar** — specs de simulação verdes + `bundle exec rspec` verde. Aplicar `0018` no Postgres de teste.
- [ ] **Step 5: Commit** — `feat(scraper): motor de simulação pré-jogo (Poisson+DC, NB, MC 10k, player allocation) + 0018 fixture_simulations + hook orchestrator`.

**Acceptance:** saída 100% escalar; reprodutível com seed; degradação honesta; warning-safe no orchestrator; `0018` aplica limpo.

## Task 3 (Wave 2b): Dashboard turbinado + leitura de `fixture_simulations`

**Files:** Create `lib/fixtures/simulation-repository.ts` (+ test); Modify `app/(dashboard)/**` (página de stats da fixture + componentes); tests de integração. Forbidden: scraper, `simulation/*`, `calibration-metrics.ts`, `repository.ts` (o guard genérico é T5).

- [ ] **Step 1: Testes falhando:**
  - `simulation-repository.test.ts`: `getFixtureSimulation(id)` seleciona **só colunas escalares** de `fixture_simulations` (asserta a lista de `.select(...)` — nenhum blob; sentinela igual ao guard).
  - Integração do dashboard: dado `detail_json` enriquecido (mock) + um registro `fixture_simulations` (mock), a página exibe: placar provável + barras 1X2/over/BTTS, aba stats com **números exatos** por time ("Time A: 4 escanteios, 1 gol, 5 SOT"), campo com provável XI **rotulado "provável escalação"** (nunca "oficial"), ícones de gol/cartão por jogador, tooltips explicativos (padrão do dashboard de stats atual); probabilidades visíveis **fora das tooltips** também; stat sem split → rótulo "total do jogo"; stat indisponível (posse) → não renderiza número.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `simulation-repository.ts` (escalar-only, padrão de `lib/fixtures/repository.ts`) + UI. Reusar tooltip/sparkline existentes (não duplicar). Consumir também os campos novos de fundação (`avgs`, `player_extra`, `odds_devigged`) no dashboard de stats existente onde agregam valor.
- [ ] **Step 4: Rodar e ver passar** — Vitest verde + `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(dashboard): exibe simulação pré-jogo (campo+stats+tooltips, "provável escalação") e enriquecimento de stats`.

**Acceptance:** rótulo "provável escalação" presente e explícito; nenhuma seleção de blob (sentinela); probabilidades fora de tooltip; degradação refletida na UI.

## Task 4 (Wave 3a): Calibração + `brierScore` + reconciler irmão

**Files:** Modify `lib/ai/calibration-metrics.ts` (+ test); Create `scripts/scraper/lib/scraper/simulation_reconciler.rb` (+ spec); Modify `app/(dashboard)/calibracao/**`. Forbidden: `simulation/*` (T2), `widget_merger.rb`, `simulation-repository.ts`.

- [ ] **Step 1: Testes falhando:**
  - `calibration-metrics.test.ts`: `brierScore(p, y)` = `(p−y)²`; multiclasse 1X2 = `Σ(p_i−y_i)²`; bordas (p=0/1). **Não** alterar `scoreWinner/scoreOverUnder/hitRate/calibrationBuckets` (regressão desses verde).
  - `simulation_reconciler_spec.rb`: dado `fixture_simulations` pending + resultado real (mesma fonte/forma do reconciler existente de `ai_predictions`), preenche `actual_*`, `correct_winner/over_under`, e Brier; idempotente; `fixture_id` NULL → trata; sem resultado ainda → permanece pending.
  - `/calibracao` integração: nova aba/sessão "simulação" mostra Brier (separado do hitRate do copilot).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `brierScore` (função nova + export), `simulation_reconciler.rb` (espelha o reconciler de `ai_predictions`, idempotente, pré-purga), aba em `/calibracao`.
- [ ] **Step 4: Rodar e ver passar** — Vitest + RSpec verdes; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(calibracao): brierScore + reconciler de fixture_simulations + aba simulação em /calibracao`.

**Acceptance:** Brier correto incl. multiclasse; reconciler idempotente; métricas antigas intactas.

## Task 5 (Wave 3b): Guard de payload generalizado

**Files:** Modify `lib/fixtures/repository-payload-guard.test.ts` apenas.

- [ ] **Step 1:** Alterar o teste para varrer **glob `lib/**/*repository*.ts`** (não só `repository.ts`) aplicando a mesma proibição estática de `detail_json` não-escalar; incluir `simulation-repository.ts`. Adicionar caso negativo (um `.select` com blob falharia).
- [ ] **Step 2: Rodar** — verde com os repositories atuais (incl. `simulation-repository.ts` de T3, escalar-only).
- [ ] **Step 3: Commit** — `test(guard): payload-guard varre todos lib/**/*repository*.ts (cobre simulation-repository)`.

**Acceptance:** guard cobre o módulo novo; reabertura de B12/B14 num PR futuro é pega estaticamente.

## Task 6 (Wave 4): Gate final + ADR-006 + Lição B15

- [ ] **Step 1:** Pós-merges sequenciais `--no-ff`: `cd scripts/scraper && bundle exec rspec` (verde) **&&** raiz `pnpm lint && pnpm typecheck && pnpm test` (verde).
- [ ] **Step 2:** Conferir diff: `0018` é só `CREATE TABLE/POLICY` (sem DROP); `WidgetMerger` aditivo (chaves antigas intactas); nenhuma leitura de blob no Worker (guard verde).
- [ ] **Step 3:** `CLAUDE.md`: adicionar **ADR-006** (arquitetura da simulação — modelo + `fixture_simulations` + computa no Ruby + Opção A re-scrape) e **Lição B15** (premissa de dados real `*Avgs`; camada player-level; "provável escalação" nunca XI oficial; fundação enriqueceu o `WidgetMerger`).
- [ ] **Step 4: Commit** — `docs(adr): ADR-006 simulação pré-jogo + Lição B15` (e `chore(sim): gate verde` se houver ajustes).

---

## Self-Review (autor do plano)

- **Cobertura do spec:** fundação 6 itens (T1) ✓; modelo Poisson+DC (T2) ✓; NB stats secundárias (T2) ✓; MC 10k escalares (T2) ✓; camada player + provável escalação (T2 motor / T3 UI) ✓; schema próprio `0018` (T2) ✓; dashboard turbinado (T3) ✓; calibração+Brier (T4) ✓; guard generalizado (T5) ✓; POC Lição #2 (T0) ✓; ADR-006/B15 (T6) ✓; decisão re-scrape = Opção A (registrada no spec/ADR, não vira task) ✓.
- **Placeholders:** nenhum "TBD"; contratos/fórmulas explícitos; parâmetros numéricos (ρ/k/limiar) saem do T0 e são consumidos por T2 (dependência registrada).
- **Consistência de tipos/contratos:** `Runner.simulate(detail_json) → hash escalar`; `brierScore(p,y)→number` (+ multiclasse); `getFixtureSimulation(id)` escalar-only; chaves de fundação aditivas.
- **Paralelismo seguro:** worktrees e listas allowed/forbidden disjuntas por wave; T1 é gate; T2a‖T2b e T3a‖T3b não compartilham arquivos. Merge `--no-ff` sequencial + gate combinado (padrão [[three-features-shipped]]).
- **Risco:** numeração de migration fixada em `0018` (única migration); `outcomeOdds` `fixtureId:0` no sample — T0 confirma antes de T2 depender como âncora; se vier vazio em prod, T2 trata `market_anchor`/`player_events` âncora como opcional (degrada, não quebra).
