# Loop de Banca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o loop de banca: snapshots de saldo automáticos (idempotentes, dirigidos por evento), views de ROI por casa/período, superfície `/banca` de relatórios, e extração das métricas hoje inline para um módulo puro testado.

**Architecture:** O modelo já existe (`bets`/`transactions`/`balance_snapshots`, RPCs `place_bet`/`resolve_bet`, `generate_balance_snapshots()`). Tornamos `generate_balance_snapshots` um efeito-colateral idempotente de `resolve_bet` (mesma tx, falha não reverte o ledger). Adicionamos 2 views SQL. Extraímos métricas para `lib/banca/metrics.ts`. Nova rota `/banca` consome tudo.

**Tech Stack:** Supabase Postgres (SQL migrations), Next.js 16 App Router (RSC), TypeScript, Vitest.

**Spec:** `docs/pesquisas/loop-banca-design.md`

---

## File Structure

- Create: `lib/banca/metrics.ts` — funções puras de métrica (ROI, yield, win rate, max drawdown, carry-forward).
- Create: `lib/banca/metrics.test.ts` — unit tests.
- Create: `supabase/migrations/0014_banca_loop.sql` — views `roi_by_house_view`, `roi_by_period_view`; `CREATE OR REPLACE FUNCTION resolve_bet` com chamada idempotente a `generate_balance_snapshots`.
- Create: `app/(dashboard)/banca/page.tsx` — relatórios consolidados.
- Create: `tests/integration/banca-page.test.tsx` — render + estado vazio.
- Modify: `app/(dashboard)/page.tsx` — passa a importar de `lib/banca/metrics.ts` (sem mudar números exibidos).
- Create: `tests/integration/dashboard-metrics-regression.test.tsx` — trava os números do dashboard antes/depois da extração.

> Migration numbering: número FIXADO em `0014` (próximo livre após `0013_fixture_copilot_audit.sql`; planos paralelos usam 0015/0016 — sem colisão).

---

## Task 1: Extrair métricas puras para `lib/banca/metrics.ts`

**Files:**
- Create: `lib/banca/metrics.ts`
- Test: `lib/banca/metrics.test.ts`

Contexto: hoje `app/(dashboard)/page.tsx` calcula inline (ver recon): ROI = `cumulativePl / netCapital`; yield = `(resolved_returned - resolved_staked) / resolved_staked`; winRate = `won / (won + lost)`; maxDrawdown = pico→vale sobre série de P/L. Replicar a semântica EXATA (não "melhorar" a fórmula — extração pura).

- [ ] **Step 1: Escrever os testes falhando** (`lib/banca/metrics.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { computeRoi, computeYield, computeWinRate, computeMaxDrawdown, carryForwardSeries } from "./metrics";

describe("computeRoi", () => {
  it("cumulativePl / netCapital", () => {
    expect(computeRoi({ cumulativePl: 150, netCapital: 1000 })).toBeCloseTo(0.15);
  });
  it("netCapital 0 → null (sem divisão por zero)", () => {
    expect(computeRoi({ cumulativePl: 10, netCapital: 0 })).toBeNull();
  });
});

describe("computeYield", () => {
  it("(returned - staked) / staked", () => {
    expect(computeYield({ resolvedReturned: 1100, resolvedStaked: 1000 })).toBeCloseTo(0.1);
  });
  it("staked 0 → null", () => {
    expect(computeYield({ resolvedReturned: 0, resolvedStaked: 0 })).toBeNull();
  });
});

describe("computeWinRate", () => {
  it("won / (won + lost) — void não conta", () => {
    expect(computeWinRate({ won: 6, lost: 4 })).toBeCloseTo(0.6);
  });
  it("nenhuma resolvida → null", () => {
    expect(computeWinRate({ won: 0, lost: 0 })).toBeNull();
  });
});

describe("computeMaxDrawdown", () => {
  it("maior queda pico→vale numa série de P/L acumulado", () => {
    expect(computeMaxDrawdown([0, 100, 60, 120, 50, 130])).toBeCloseTo(70); // pico 120 → vale 50
  });
  it("série sempre crescente → 0", () => {
    expect(computeMaxDrawdown([0, 10, 20, 30])).toBe(0);
  });
  it("série vazia → 0", () => {
    expect(computeMaxDrawdown([])).toBe(0);
  });
});

describe("carryForwardSeries", () => {
  it("preenche dias sem snapshot com o último saldo conhecido", () => {
    const input = [
      { date: "2026-05-01", balance: 100 },
      { date: "2026-05-04", balance: 130 },
    ];
    const out = carryForwardSeries(input, "2026-05-01", "2026-05-05");
    expect(out).toEqual([
      { date: "2026-05-01", balance: 100 },
      { date: "2026-05-02", balance: 100 },
      { date: "2026-05-03", balance: 100 },
      { date: "2026-05-04", balance: 130 },
      { date: "2026-05-05", balance: 130 },
    ]);
  });
  it("série vazia → array vazio", () => {
    expect(carryForwardSeries([], "2026-05-01", "2026-05-03")).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm test lib/banca/metrics.test.ts` → FAIL (módulo não existe).
- [ ] **Step 3: Implementar `lib/banca/metrics.ts`** com as 5 funções puras. Assinaturas exatas conforme os testes. `computeRoi`/`computeYield`/`computeWinRate` retornam `number | null` (null quando denominador 0). `computeMaxDrawdown(series: number[]): number`. `carryForwardSeries(points: {date:string;balance:number}[], from:string, to:string): {date:string;balance:number}[]` — itera dia-a-dia (UTC date string `YYYY-MM-DD`), carrega o último balance visto; antes do primeiro ponto não emite (começa no `from` só se houver ponto ≤ from — replicar a regra do teste: primeiro ponto é a primeira data presente).
- [ ] **Step 4: Rodar e ver passar** — `pnpm test lib/banca/metrics.test.ts` → PASS.
- [ ] **Step 5: Commit** — `test+feat(banca): lib/banca/metrics.ts puro (ROI/yield/winrate/drawdown/carry-forward)`.

## Task 2: Dashboard usa `lib/banca/metrics.ts` (sem mudar números) + teste de regressão

**Files:**
- Modify: `app/(dashboard)/page.tsx` (substituir os cálculos inline pelas funções de `lib/banca/metrics.ts`)
- Test: `tests/integration/dashboard-metrics-regression.test.tsx`

- [ ] **Step 1: Teste de regressão falhando** — renderiza `/` (Server Component) com Supabase mockado (padrão de `tests/integration/stats-page.test.tsx`) com um dataset fixo e asserta os valores formatados de ROI/yield/winRate/drawdown/saldo. Capture os valores ATUAIS rodando o teste contra o código inline antes da troca (anote os números esperados no teste).
- [ ] **Step 2: Rodar — deve passar contra o código inline atual** (estabelece baseline). `pnpm test tests/integration/dashboard-metrics-regression.test.tsx` → PASS.
- [ ] **Step 3: Refatorar `app/(dashboard)/page.tsx`** para importar e usar `computeRoi/computeYield/computeWinRate/computeMaxDrawdown` de `lib/banca/metrics.ts`. Não alterar queries nem formatação.
- [ ] **Step 4: Rodar regressão — deve continuar PASS** (mesmos números). Rodar também `pnpm typecheck`.
- [ ] **Step 5: Commit** — `refactor(banca): dashboard usa lib/banca/metrics (números inalterados, regressão travada)`.

## Task 3: Snapshot idempotente dirigido por `resolve_bet`

**Files:**
- Create: `supabase/migrations/0014_banca_loop.sql` (parte 1: função)

Contexto: `resolve_bet(p_bet_id, p_status, p_actual_return, p_resolved_at)` existe em `supabase/migrations/0006_bet_rpcs.sql`. `generate_balance_snapshots(p_date date)` existe em `0003_balance_snapshots.sql` e é idempotente.

- [ ] **Step 1: Teste de integração SQL falhando** — spec que: (a) chama `resolve_bet` numa aposta pending fixture; (b) asserta que existe linha em `balance_snapshots` para `p_resolved_at::date` logo após (sem chamar `generate_balance_snapshots` manualmente); (c) chama `resolve_bet`/regenera de novo e asserta idempotência (sem linha duplicada, valores corretos). Seguir o padrão de teste SQL do repo (mock Supabase de `tests/integration/`, ou RSpec do scraper se houver harness SQL — usar o que o repo já usa para RPCs; se não houver, teste via client Supabase em `tests/integration/banca-snapshot.test.ts` chamando `.rpc('resolve_bet', …)` contra o Postgres local de teste).
- [ ] **Step 2: Rodar e ver falhar** (hoje o snapshot não é gerado no resolve).
- [ ] **Step 3: Escrever `0014` parte 1** — `CREATE OR REPLACE FUNCTION resolve_bet(...)` idêntica à atual + ao final, antes do `RETURN`, dentro de bloco protegido:

```sql
  BEGIN
    PERFORM generate_balance_snapshots(p_resolved_at::date);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'resolve_bet: generate_balance_snapshots falhou para % (%): %', p_resolved_at::date, SQLERRM, SQLSTATE;
  END;
```

(Copiar o corpo atual de `resolve_bet` de `0006_bet_rpcs.sql` integralmente e só anexar o bloco — não reescrever a lógica.)

- [ ] **Step 4: Aplicar a migration no Postgres de teste e rodar — PASS** (snapshot existe pós-resolve; idempotente).
- [ ] **Step 5: Commit** — `feat(banca): resolve_bet gera balance_snapshot idempotente na mesma tx (warning-safe)`.

## Task 4: Views `roi_by_house_view` e `roi_by_period_view`

**Files:**
- Modify: `supabase/migrations/0014_banca_loop.sql` (parte 2: views)
- Test: `tests/integration/banca-views.test.ts`

- [ ] **Step 1: Teste falhando** — dado fixture conhecido de `bets`/`transactions` (1 casa, apostas won/lost/void), asserta:
  - `roi_by_house_view`: por casa → `resolved_staked`, `resolved_returned`, `roi` (= (returned-staked)/net? usar a MESMA definição do dashboard: yield por casa = (returned-staked)/staked; roi por casa = pl/net_capital_da_casa), `win_rate`, `bet_count`, `pending_stake`. Definir explicitamente as fórmulas no teste com números calculados à mão.
  - `roi_by_period_view`: agregado por `to_char(resolved_at,'YYYY-MM')` e uma linha rolling-30d.
- [ ] **Step 2: Rodar e ver falhar** (views não existem).
- [ ] **Step 3: Escrever as 2 views** em `0014` parte 2. Derivar só de `bets`/`bet_selections`/`transactions`. RLS herdada (views sem `security_invoker` seguem o padrão das views existentes em `0004_views.sql` — replicar o padrão exato daquele arquivo, incluindo `GRANT`).
- [ ] **Step 4: Aplicar + rodar — PASS** (números batem com cálculo manual).
- [ ] **Step 5: Commit** — `feat(banca): views roi_by_house_view + roi_by_period_view`.

## Task 5: Rota `/banca` (relatórios consolidados)

**Files:**
- Create: `app/(dashboard)/banca/page.tsx`
- Test: `tests/integration/banca-page.test.tsx`

- [ ] **Step 1: Teste falhando** — render do Server Component com Supabase mockado: exibe P/L por casa (de `roi_by_house_view`), yield por tipo de aposta (single/multiple/system — agregado de `bets.kind`), streaks de vitória/derrota (sequência em `bets` resolvidas ordenadas por `resolved_at`), ROI rolling 30d e breakdown mensal (de `roi_by_period_view`). Caso vazio → mensagem amigável, sem erro.
- [ ] **Step 2: Rodar e ver falhar** (rota não existe).
- [ ] **Step 3: Implementar `app/(dashboard)/banca/page.tsx`** — Server Component; usa `createClient` (padrão das outras páginas do dashboard); consome as views; usa `lib/banca/metrics.ts` (ex.: streaks helper — adicionar `computeStreaks(results: ('W'|'L')[])` a metrics.ts COM teste em metrics.test.ts antes, sub-passo TDD); formata com `lib/format.ts` (`fmt.*`); reusa o componente de sparkline já usado em `app/(dashboard)/page.tsx` (importar o mesmo, não duplicar). Adicionar link no nav do dashboard layout se houver um índice de navegação (verificar `app/(dashboard)/layout.tsx`; se houver lista de rotas, adicionar "Banca").
- [ ] **Step 4: Rodar — PASS**; `pnpm lint && pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(banca): rota /banca com relatórios consolidados (ROI casa/período, yield por tipo, streaks)`.

## Task 6: Gate final + verificação

- [ ] **Step 1:** `pnpm lint` (0 erros) `&& pnpm typecheck` (limpo) `&& pnpm test` (toda a suíte verde).
- [ ] **Step 2:** Verificar manualmente o diff: nenhuma mudança nas queries/forматação do dashboard `/` além da troca para `lib/banca/metrics`; migration `0014` é `CREATE OR REPLACE`/`CREATE VIEW` (sem DROP destrutivo).
- [ ] **Step 3: Commit** (se houver ajustes do gate) — `chore(banca): gate verde`.

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** snapshots idempotentes (T3) ✓; views ROI casa/período (T4) ✓; superfície /banca (T5) ✓; extração lib/banca/metrics (T1-2) ✓; carry-forward (T1) ✓; error handling warning-safe (T3) ✓.
- **Placeholders:** nenhum "TBD"; código/SQL concretos ou contrato exato + fórmulas explicitadas nos testes.
- **Consistência de tipos:** `computeRoi/Yield/WinRate → number|null`; `computeMaxDrawdown(number[])→number`; `carryForwardSeries`/`computeStreaks` assinaturas fixadas em T1/T5.
- **Risco:** numeração de migration — confirmar próximo número livre antes (nota no File Structure).
