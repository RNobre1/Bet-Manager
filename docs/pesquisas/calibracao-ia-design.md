# Design — Calibração da IA (versão enxuta)

> **Status:** APPROVED · **Data:** 2026-05-17 · **Owner:** Rafael Nobre
> **Origem:** trackear previsão do copilot vs. resultado real → métrica de acerto/confiança. Recon revelou bloqueador de ground truth (sem placar final persistido; retenção 3 dias).
> **Escopo:** sub-projeto independente. Toca `app/api/fixture-copilot/route.ts`, scraper Ruby (passo de reconciliação) e uma rota nova. **Não** toca banca nem o copilot geral.

## Problema

Não há como calibrar previsão vs. resultado hoje: `llm_request_logs` não guarda a resposta do modelo nem predição estruturada (só `hops`); o copilot devolve prosa; e o **placar final nunca é capturado** (`fixtures.status` nunca atualiza, scraper só coleta pré-jogo, fixtures purgadas em 3 dias). Calibração exige 3 peças novas: persistir predição estruturada, capturar resultado real, reconciliar.

## Decisões (travadas no brainstorm)

1. **Versão enxuta primeiro.** Predição mínima estruturada; captura de resultado reaproveitando o scraper; sem matar a retenção.
2. **Só `fixture-copilot`** (jogo único — onde uma predição faz sentido). O copilot geral cross-jogo fica fora.
3. Tabela de predição **auto-contida** (não depende da fixture sobreviver à purga).

## Arquitetura

```
fixture-copilot responde  → SYSTEM_PROMPT pede bloco JSON final compacto
   route faz parse defensivo (mesmo padrão guardado do drawer)  → INSERT ai_predictions
                                                                    (auto-contida)
[scrape-daily.yml, passo novo]  reconciliação:
   p/ ai_predictions sem actual_result e kickoff < now
     → busca placar final no choistats (reusa HTTP client do scraper)
     → preenche actual_result + flags de acerto
/calibracao  → taxa de acerto + calibração (confiança prevista vs. realizada) por modelo/rota
```

**1. Captura de predição.** O `SYSTEM_PROMPT` de `fixture-copilot` instrui o modelo a **encerrar a resposta** com um bloco fenced ` ```json {"prediction":{"winner":"home|draw|away","confidence":0..1,"over_under_2_5":"over|under"}} ``` `. A route extrai o bloco e faz parse **defensivo** (mesmo padrão `res.text()`+`JSON.parse` guardado, rejeita não-objeto — já endurecido no hardening). Bloco ausente/inválido → **não loga predição** naquele turno (silencioso, sem quebrar a resposta ao usuário). A prosa exibida ao usuário não muda (o bloco é apêndice machine-readable; o cliente já renderiza markdown — opcionalmente o drawer oculta o fenced block do render, decisão de UI no plano).

**2. Tabela `ai_predictions` (auto-contida).** Guarda o suficiente pra sobreviver à purga de `fixtures`:
`id, created_at, fixture_id (nullable, sem FK rígida), route, model, reasoner, home_team, away_team, league, kickoff_utc, pred_winner, pred_confidence, pred_over_under, raw_excerpt, status ('pending'|'resolved'|'unresolvable', default 'pending'), actual_home_goals, actual_away_goals, actual_resolved_at, correct_winner (bool), correct_over_under (bool)`. `status` é o indicador de ciclo (pending até a reconciliação; `unresolvable` após N tentativas sem placar). Insert na route (fire-and-forget, mesmo padrão de `lib/llm-logs.ts`). RLS: tabela de sistema, service-role only (igual `llm_request_logs`).

**3. Reconciliação.** Passo novo no `scrape-daily.yml` (após o scrape, antes da purga) — script Ruby em `scripts/scraper/` que: seleciona `ai_predictions` com `actual_resolved_at IS NULL AND kickoff_utc < now()`; para cada, resolve o placar final via choistats (o mesmo `ChoistatsApiFetcher`/HTTP client já usado — o jogo já jogado expõe `homeGoalsFt/awayGoalsFt`); preenche `actual_*` e computa `correct_winner`/`correct_over_under`. Idempotente (só linhas sem `actual_resolved_at`). Independe da fixture ainda existir (dados de time/kickoff estão na própria linha).

**4. Superfície `/calibracao`** (Server Component): taxa de acerto global e por `winner`/`over_under`; **curva de calibração** (bucketiza `pred_confidence` em faixas, plota previsto vs. realizado) por modelo e rota; contagem de predições pendentes de reconciliação. Reusa o padrão de chart do dashboard.

## Error handling

- Parse do bloco de predição: defensivo, falha → skip silencioso (nunca afeta a resposta ao usuário nem lança).
- Insert `ai_predictions`: fire-and-forget como `llm-logs` (falha não bloqueia a resposta).
- Reconciliação: placar não encontrado no choistats (jogo adiado/cancelado) → deixa `actual_resolved_at` nulo e re-tenta no próximo dia; após N dias sem resultado, marca `status='unresolvable'` (não polui métrica).

## Testes (pirâmide TDD — testes primeiro)

- **Unit:** extrator/parse do bloco JSON de predição (válido, ausente, malformado, array, texto extra ao redor); cálculo de `correct_winner`/`correct_over_under` dado placar; bucketização da curva de calibração.
- **Integração (route):** `fixture-copilot` com resposta contendo bloco → insere 1 `ai_predictions`; resposta sem bloco → 0 inserts; resposta do usuário inalterada nos dois casos.
- **Integração (reconciliação Ruby):** convenção RSpec do scraper (`scripts/scraper/spec/`) — dado `ai_predictions` pendente e placar mockado, preenche `actual_*` e flags; idempotente; jogo sem placar fica pendente.
- **Integração (page):** `/calibracao` renderiza com dados mockados; estado "sem predições ainda".

## Riscos / trade-offs

- Modelo pode não emitir o bloco de forma consistente → mitigado por parse defensivo + skip silencioso; mede-se a taxa de "predição emitida" como saúde da feature.
- Choistats pode não expor placar de toda liga pós-jogo → linhas ficam `unresolvable`, não contaminam a métrica.
- Predição mínima (winner+confidence+O/U) é deliberadamente pobre — suficiente pra primeira métrica de calibração; enriquecer é follow-up.

## Fora de escopo

Predição no copilot geral cross-jogo; predição rica (placar exato, mercados múltiplos); arquivamento histórico sem purga; re-treino/auto-ajuste de prompt. YAGNI.
