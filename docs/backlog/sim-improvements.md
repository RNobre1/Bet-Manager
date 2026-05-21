# Backlog — melhorias do motor de simulação pré-jogo

> **Sessão autônoma iniciada 2026-05-21.** Pilot autorizou implementação contínua até "tudo 100%". Backlog vivo: cada feature tem checkbox + estado + commits relacionados. Atualizar ao concluir/abandonar cada uma.

## Critérios de decisão (aplicar a TODAS as features)

- **min_samples_per_league = 30**: ligas com menos de 30 jogos persistidos em `fixture_simulations` (com `actual_*` resolvido) continuam no fallback global; auto-calibrações ignoram essas ligas.
- **Brier score binário (1X2) + multiclasse + over/under 2.5** como KPI primário em toda comparação A/B.
- **TDD primeiro, sempre.** Cada feature: spec → plan → subagent-driven TDD com 2-stage review (spec compliance → code quality adversarial) → push main → deploy CF Workers verde → atualização aqui.
- **Lição [[simulacao-pre-jogo-directives]] aplicada**: integration tests precisam alimentar a shape REAL do produtor Ruby, nunca mock hand-fabricado.

## Decisões consolidadas

| Decisão | Razão |
|---|---|
| GNN incluído (F14) | Pilot decidiu manter (única feature mantida da Seção 2 "fora do mundo de apostas"). |
| F9 (recent_matches prior) fundido em F8 | Bayesiano hierárquico acomoda forma temporal nativamente. |
| F11 (bivariate Poisson) marcado **stretch** | Só implementar se F4+F8 não fecharem calibração de placares baixos. |
| F12 (faltas/offsides/throw-ins) **cosmético** | Prioridade baixa; uso pessoal não exige. |
| F13 (stacking) **condicional** | Só vale se F8/F14 divergirem do baseline atual o suficiente em A/B. |
| F7 (xG) **POC de 1h antes** | Risco técnico: choistats pode não expor sinal cru. |

## Waves

### Wave 0 — Observabilidade (sequencial, GATE pra tudo)

- [ ] **F1** — Reliability diagram (probability bins vs frequência observada) + Brier-over-time no `/calibracao`.
  - Status: EM CURSO
  - Arquivos previstos: `app/(dashboard)/calibracao/...`, `lib/calibracao/...`, testes em `tests/integration/calibracao-*`.
  - Commits: _(a registrar)_

- [ ] **F2** — Ground-truth do mercado: comparar `p_home` modelo vs `1/odd_devigada` por liga/janela, com detecção de viés sistemático no `/calibracao`.
  - Status: pending
  - Dependências: F1 (mesma página)
  - Commits: _(a registrar)_

### Wave 1 — Calibrações baratas (paralelo via worktrees + subagent-driven)

- [ ] **F3** — Calibração isotônica pós-modelo (cron mensal; persistir curve em `model_calibration` table).
  - Status: pending
  - Custo: ~1d
  - Commits: _(a registrar)_

- [ ] **F6** — Acoplar `detail_json.referee_record.avg_total_booking_points` ao modelo de cartões em `Simulation::Rates`/`MonteCarlo`.
  - Status: pending
  - Custo: ~1d
  - Commits: _(a registrar)_

- [ ] **F10** — Acoplar `detail_json.player_extra` (form + `outcome_odds_by_player.ANYTIME_SCORER`) na alocação de eventos por jogador.
  - Status: pending
  - Custo: ~2d
  - Commits: _(a registrar)_

### Wave 2 — Auto-tuning por liga (sozinho)

- [ ] **F4** — Cron mensal L-BFGS minimizando log-loss sobre histórico, por liga. Substitui `NEUTRAL_BASELINE` + `RHO_BY_LEAGUE` vazio. Persistir em `model_calibration` (effective_from/effective_until).
  - Status: pending
  - Custo: ~3d
  - Cobre: A1 (baselines por liga) + A5 (ρ por liga) + parte de C2.
  - Commits: _(a registrar)_

### Wave 3 — A/B infra (gate pra Wave 4)

- [ ] **F5** — Storage + UI pra rodar 2+ `model_version` na mesma fixture e comparar Brier acumulado. Permite "shadow deploy" de modelo novo.
  - Status: pending
  - Custo: ~2d
  - Commits: _(a registrar)_

### Wave 4 — Motores novos via A/B

- [ ] **F7** — xG-derivado. POC de 1h primeiro pra confirmar se choistats tem sinal cru ou se cai pra proxy de chances/SOT. Decisão registrada após POC.
  - Status: pending (POC pendente)
  - Custo: 1h POC + 4d se confirmar
  - Commits: _(a registrar)_

- [ ] **F8** — Bayesiano hierárquico (Baio-Blangiardo 2010) reescrevendo `Simulation::Rates`. Cada time = vetor latente (ataque/defesa/HA individual) com prior por liga; atualização incremental MCMC. **Fundi F9 aqui** (recent_matches como prior temporal nativo).
  - Status: pending
  - Custo: ~7d
  - Commits: _(a registrar)_

### Wave 5 — GNN (motor extra, offline pipeline Python)

- [ ] **F14** — Graph Neural Network sobre histórico de jogos (times = nós, jogos = arestas). Pipeline offline Python (PyTorch Geometric ou DGL); script semanal/mensal que exporta `team_embeddings.json` por liga. Motor Ruby consome embeddings como features extras pro `Rates`. Roda como `model_version` novo via A/B contra Dixon-Coles e Bayesiano. Stanton et al. 2022.
  - Status: pending
  - Custo: ~7d (incluindo provisionamento ML)
  - Commits: _(a registrar)_

### Wave 6 — Cosmético + reavaliação final

- [ ] **F12** — Estender Monte Carlo pra simular faltas/offsides/throw-ins (já no `detail_json`).
  - Status: pending
  - Custo: ~2d
  - Commits: _(a registrar)_

- [ ] **F11** — Bivariate Poisson / Skellam. **Decisão pós-medição** (só se F4+F8 não fecharem placares baixos).
  - Status: candidato pendente decisão
  - Commits: _(a registrar)_

- [ ] **F13** — Stacking/ensemble dos modelos A/B (Dixon-Coles + Bayesiano + GNN + xG). **Decisão pós-medição** (só se modelos divergirem o suficiente em Brier).
  - Status: candidato pendente decisão
  - Commits: _(a registrar)_

## Backlog rolling (capturar tudo que aparecer no caminho)

_Lista de captura de tudo que surgir como tarefa derivada durante a execução. Tarefa estável ⇒ promover a feature numerada acima ou a backlog separado._

- (nada ainda)

## Estado de cada Wave

- **Wave 0**: EM CURSO (2026-05-21)
- demais: pending
