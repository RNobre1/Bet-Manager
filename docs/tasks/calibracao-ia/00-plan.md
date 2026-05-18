# Calibração da IA (enxuta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Capturar predição estruturada mínima do `fixture-copilot`, reconciliar com o resultado real (via scraper), e expor uma tela de acerto/calibração.

**Architecture:** SYSTEM_PROMPT do `fixture-copilot` instrui um bloco JSON final; a route parseia defensivamente e insere em `ai_predictions` (auto-contida, sobrevive à purga). Passo novo no `scrape-daily.yml` reconcilia placar final via choistats. `/calibracao` mostra a métrica.

**Tech Stack:** Next.js 16 route handler + RSC, Supabase Postgres (1 migration), Ruby (scraper, RSpec), TypeScript/Vitest.

**Spec:** `docs/pesquisas/calibracao-ia-design.md`

---

## File Structure

- Create: `lib/ai/prediction-block.ts` — extrai/valida o bloco JSON de predição (puro).
- Create: `lib/ai/prediction-block.test.ts` — unit.
- Create: `lib/ai/predictions-repository.ts` — insert fire-and-forget em `ai_predictions` (padrão `lib/llm-logs.ts`).
- Create: `supabase/migrations/0016_ai_predictions.sql` — tabela + índices + RLS (service-role).
- Modify: `app/api/fixture-copilot/route.ts` — após resposta, extrai bloco + insere predição (fire-and-forget); SYSTEM_PROMPT ganha instrução do bloco.
- Create: `scripts/scraper/lib/scraper/prediction_reconciler.rb` — reconciliação.
- Create: `scripts/scraper/spec/scraper/prediction_reconciler_spec.rb` — RSpec.
- Modify: `scripts/scraper/bin/scrape` (ou o entrypoint do orchestrator) — chama o reconciler após scrape, antes da purga.
- Modify: `.github/workflows/scrape-daily.yml` — (nenhuma mudança se o reconciler roda dentro do `bin/scrape`; confirmar).
- Create: `app/(dashboard)/calibracao/page.tsx` + `tests/integration/calibracao-page.test.tsx`.
- Create: `lib/ai/calibration-metrics.ts` + `.test.ts` — acerto e bucketização da curva (puro).

> Migration FIXADA em `0016_ai_predictions.sql` (loop-banca 0014, alertas 0015 — sem colisão).

---

## Task 1: Extrator do bloco de predição (`lib/ai/prediction-block.ts`)

**Files:** Create `lib/ai/prediction-block.ts`, Test `lib/ai/prediction-block.test.ts`

Contrato do bloco que o modelo emite ao final da resposta:
` ```json\n{"prediction":{"winner":"home|draw|away","confidence":<0..1>,"over_under_2_5":"over|under"}}\n``` `

- [ ] **Step 1: Testes falhando**

```ts
import { describe, it, expect } from "vitest";
import { extractPrediction } from "./prediction-block";

const wrap = (j: string) => `Análise...\n\n\`\`\`json\n${j}\n\`\`\``;

describe("extractPrediction", () => {
  it("bloco válido → objeto normalizado", () => {
    expect(extractPrediction(wrap('{"prediction":{"winner":"home","confidence":0.7,"over_under_2_5":"over"}}')))
      .toEqual({ winner: "home", confidence: 0.7, over_under_2_5: "over" });
  });
  it("sem bloco → null", () => {
    expect(extractPrediction("só prosa, nenhuma predição")).toBeNull();
  });
  it("JSON malformado → null (defensivo, nunca lança)", () => {
    expect(extractPrediction(wrap("{nao eh json"))).toBeNull();
  });
  it("não-objeto / array → null", () => {
    expect(extractPrediction(wrap("[1,2,3]"))).toBeNull();
  });
  it("winner inválido → null", () => {
    expect(extractPrediction(wrap('{"prediction":{"winner":"xpto","confidence":0.5,"over_under_2_5":"over"}}'))).toBeNull();
  });
  it("confidence fora de [0,1] → clamp", () => {
    expect(extractPrediction(wrap('{"prediction":{"winner":"draw","confidence":1.5,"over_under_2_5":"under"}}')))
      .toEqual({ winner: "draw", confidence: 1, over_under_2_5: "under" });
  });
});
```

- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — regex pega o ÚLTIMO fenced ` ```json … ``` `; `JSON.parse` em try/catch; valida `parsed.prediction` é objeto não-array; `winner ∈ {home,draw,away}`; `over_under_2_5 ∈ {over,under}`; `confidence` número → clamp `[0,1]`; qualquer falha → `null`. Tipo de retorno: `{winner:'home'|'draw'|'away';confidence:number;over_under_2_5:'over'|'under'} | null`.
- [ ] **Step 4: Rodar — PASS.**
- [ ] **Step 5: Commit** — `test+feat(ai): extrator defensivo do bloco de predição`.

## Task 2: Migration `ai_predictions`

**Files:** Create `supabase/migrations/0016_ai_predictions.sql`, Test `tests/integration/ai-predictions-table.test.ts`

- [ ] **Step 1: Teste falhando** — insert via service-role client de uma predição com todos os campos; ler de volta; `status` default `'pending'`; índice por `(status, kickoff_utc)` existe (consulta `pg_indexes`); RLS bloqueia role `anon`.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Migration**

```sql
create table if not exists public.ai_predictions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  fixture_id bigint,
  route text not null,
  model text,
  reasoner boolean not null default false,
  home_team text not null,
  away_team text not null,
  league text,
  kickoff_utc timestamptz,
  pred_winner text not null check (pred_winner in ('home','draw','away')),
  pred_confidence numeric(4,3) not null check (pred_confidence between 0 and 1),
  pred_over_under text not null check (pred_over_under in ('over','under')),
  raw_excerpt text,
  status text not null default 'pending' check (status in ('pending','resolved','unresolvable')),
  actual_home_goals int,
  actual_away_goals int,
  actual_resolved_at timestamptz,
  correct_winner boolean,
  correct_over_under boolean
);
create index if not exists ai_predictions_status_kickoff_idx on public.ai_predictions (status, kickoff_utc);
alter table public.ai_predictions enable row level security;
-- service-role only (igual llm_request_logs): sem policy para anon/authenticated
grant select, insert, update on public.ai_predictions to service_role;
```

(Espelhar EXATAMENTE o padrão de `supabase/migrations/0012_create_llm_request_logs.sql` quanto a RLS/grants — conferir esse arquivo e replicar a postura service-role.)

- [ ] **Step 4: Aplicar + rodar — PASS.**
- [ ] **Step 5: Commit** — `feat(ai): tabela ai_predictions auto-contida (service-role, sobrevive à purga)`.

## Task 3: Repositório de inserção (fire-and-forget)

**Files:** Create `lib/ai/predictions-repository.ts`, Test `lib/ai/predictions-repository.test.ts`

- [ ] **Step 1: Teste falhando** — `recordPrediction(adminClient, payload)` chama `.from('ai_predictions').insert(payload)`; erro do Supabase é engolido (não lança — padrão de `lib/llm-logs.ts`, conferir e espelhar a assinatura/estilo); payload sem `prediction` não deve ser chamado (guard no caller, não aqui).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** espelhando `lib/llm-logs.ts` (mesmo cliente admin, mesmo try/catch silencioso, mesma forma de export).
- [ ] **Step 4: Rodar — PASS.**
- [ ] **Step 5: Commit** — `test+feat(ai): predictions-repository fire-and-forget`.

## Task 4: `fixture-copilot` emite + persiste predição

**Files:** Modify `app/api/fixture-copilot/route.ts`, Test `tests/api/fixture-copilot-prediction.test.ts`

Contexto: route já endurecida (orçamento + parse). NÃO alterar a lógica de orçamento; só (a) acrescentar instrução no SYSTEM_PROMPT, (b) após obter `content` final, extrair predição e gravar.

- [ ] **Step 1: Testes falhando**
  - resposta do modelo contendo bloco válido → 1 chamada a `recordPrediction` com `route:'fixture-copilot'`, times/kickoff/league da fixture (resolver do `fixture_id` como a route já faz), `model`, `reasoner`, campos da predição; resposta ao usuário **inalterada** (o `content` retornado é o mesmo).
  - resposta sem bloco → `recordPrediction` NÃO chamado; resposta inalterada.
  - `recordPrediction` lançando → não afeta a resposta (fire-and-forget).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar**
  - SYSTEM_PROMPT: anexar parágrafo pt-BR instruindo terminar SEMPRE com o bloco ` ```json {"prediction":{...}} ``` ` no formato exato (winner/confidence/over_under_2_5), e que o bloco é metadado (não comentar sobre ele na prosa).
  - Após o loop produzir `content`: `const pred = extractPrediction(content); if (pred) recordPrediction(admin, {route:'fixture-copilot', fixture_id, home_team, away_team, league, kickoff_utc, model, reasoner, ...pred, raw_excerpt: <trecho do bloco>});` — fire-and-forget (não `await` bloqueante além do padrão de logs já usado; espelhar como `llm-logs` é chamado na mesma route).
  - Não remover o bloco do `content` (decisão: cliente renderiza markdown; o fenced json aparece pequeno. Se o spec/UI pedir ocultar, é sub-passo de UI no drawer — fora deste plano salvo instrução; manter simples).
- [ ] **Step 4: Rodar — PASS**; `pnpm test tests/api/fixture-copilot*.test.ts` (regressão do hardening continua verde) `&& pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(ai): fixture-copilot emite e persiste predição estruturada`.

## Task 5: Métricas de calibração puras

**Files:** Create `lib/ai/calibration-metrics.ts`, Test `lib/ai/calibration-metrics.test.ts`

- [ ] **Step 1: Testes falhando** — `scoreWinner(pred, homeGoals, awayGoals)` → bool; `scoreOverUnder(pred, homeGoals, awayGoals)` (>2.5 → over) → bool; `hitRate(rows)` → {winner:%, overUnder:%}; `calibrationBuckets(rows, nBuckets=5)` → por faixa de confiança: `{range, predictedAvg, realizedAccuracy, n}`. Casos de borda: sem rows resolvidas → null/zeros; placar 2-1 (=3 → over), 1-1 (=2 → under).
- [ ] **Step 2: Rodar — FAIL.** 
- [ ] **Step 3: Implementar** funções puras.
- [ ] **Step 4: Rodar — PASS.**
- [ ] **Step 5: Commit** — `test+feat(ai): métricas de calibração (acerto + curva por bucket)`.

## Task 6: Reconciliador Ruby (scraper)

**Files:** Create `scripts/scraper/lib/scraper/prediction_reconciler.rb`, Spec `scripts/scraper/spec/scraper/prediction_reconciler_spec.rb`, Modify entrypoint do scrape.

Contexto: o scraper já tem HTTP client choistats (`ChoistatsApiFetcher`) e acesso ao Postgres (conferir como o orchestrator escreve no DB e replicar a conexão).

- [ ] **Step 1: RSpec falhando** (convenção `scripts/scraper/spec/`) — dado `ai_predictions` com `status='pending'` e `kickoff_utc < now`, e um placar mockado do choistats para aquele jogo, o reconciler: preenche `actual_home_goals/away_goals/actual_resolved_at`, computa `correct_winner`/`correct_over_under`, seta `status='resolved'`; idempotente (linhas `resolved` ignoradas); jogo sem placar disponível → continua `pending`; após `MAX_ATTEMPTS` (constante, ex. 4 dias) sem placar → `status='unresolvable'`. Resolver o jogo por `home_team/away_team/kickoff_utc` (a fixture pode já ter sido purgada — usar os campos da própria linha).
- [ ] **Step 2: Rodar — FAIL** (`cd scripts/scraper && bundle exec rspec spec/scraper/prediction_reconciler_spec.rb`).
- [ ] **Step 3: Implementar** `PredictionReconciler` — seleciona pendentes vencidas, consulta choistats reusando o fetcher existente (jogo já jogado expõe gols finais), atualiza linhas. Idempotente e seguro (warning + skip em erro de rede por linha; não derruba o scrape).
- [ ] **Step 4: Plugar no scrape** — chamar o reconciler no entrypoint do scrape APÓS o persist e ANTES da purga (conferir `scripts/scraper/lib/scraper/orchestrator.rb` ~linha 150 do recon; inserir chamada com rescue isolado, padrão de isolamento de exceção já usado no orchestrator). Confirmar que `scrape-daily.yml` não precisa mudar (roda dentro do `bin/scrape`).
- [ ] **Step 5: Rodar RSpec — PASS**; rodar a suíte Ruby completa do scraper.
- [ ] **Step 6: Commit** — `feat(ai): reconciliador de predição no scrape (placar choistats, idempotente, pré-purga)`.

## Task 7: Rota `/calibracao`

**Files:** Create `app/(dashboard)/calibracao/page.tsx`, Test `tests/integration/calibracao-page.test.tsx`

- [ ] **Step 1: Teste falhando** — Server Component com Supabase mockado: taxa de acerto (winner / over-under) global, curva de calibração por bucket (usa `lib/ai/calibration-metrics.ts`), contagem `pending`/`unresolvable`, breakdown por `model`/`route`. Sem predições resolvidas → estado vazio amigável.
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — query `ai_predictions` (service-role via admin client — é tabela de sistema; seguir como `/logs` lê `llm_request_logs`), aplica `calibration-metrics`, renderiza com `fmt.*` + componente de chart já existente. Adicionar ao nav se houver índice (como em loop-banca T5).
- [ ] **Step 4: Rodar — PASS**; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(ai): rota /calibracao (acerto + curva de calibração)`.

## Task 8: Gate final

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm test` (TS) e `cd scripts/scraper && bundle exec rspec` (Ruby) — tudo verde.
- [ ] **Step 2:** Verificar: hardening do `fixture-copilot` intacto (testes de orçamento/parse continuam verdes); migration é aditiva; reconciler não derruba o scrape em erro de rede.
- [ ] **Step 3: Commit** se ajuste — `chore(ai): gate verde`.

---

## Self-Review

- **Cobertura do spec:** extrator defensivo (T1) ✓; ai_predictions auto-contida (T2) ✓; insert fire-and-forget (T3) ✓; fixture-copilot emite+persiste, resposta inalterada (T4) ✓; métricas/curva (T5) ✓; reconciliação pré-purga via choistats, status unresolvable (T6) ✓; /calibracao (T7) ✓; só fixture-copilot, copilot geral fora ✓.
- **Placeholders:** nenhum; SQL/regex/contratos concretos, testes reais.
- **Consistência de tipos:** `extractPrediction → {winner,confidence,over_under_2_5}|null` (T1) reusado em T4/T5/T6; colunas de `ai_predictions` (T2) idênticas às lidas em T5/T6/T7; `status` enum consistente.
- **Risco:** numeração de migration (paralelo); confirmar API choistats expõe placar pós-jogo na T6 (se não, linhas viram `unresolvable` — degradação graciosa já no design).
