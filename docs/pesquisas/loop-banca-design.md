# Design — Fechar o loop de banca (automação + relatórios)

> **Status:** APPROVED · **Data:** 2026-05-17 · **Owner:** Rafael Nobre
> **Origem:** pedido de fechar o ciclo de gestão de banca (registrar resultado → ROI/evolução no tempo). Recon mostrou que o modelo já existe; o gap é automação + relatórios.
> **Escopo:** sub-projeto independente. Não toca fixtures/copilot/scraper.

## Problema

O modelo de banca está completo e em produção (`bets`, `transactions`, `bet_events`, `balance_snapshots`, RPCs `place_bet`/`resolve_bet`, views `house_balance_view`/`bet_summary_view`/`daily_pl_view`). Criar→resolver→ledger funciona. Três gaps quebram o "loop":

1. `generate_balance_snapshots()` (migration 0003) **existe mas nunca é chamada automaticamente** — `daily_pl_view` fica desatualizada (hiato de 1–N dias no sparkline/ROI do dashboard).
2. ROI só existe **global**, calculado *inline* em `app/(dashboard)/page.tsx` — sem breakdown por casa nem por período.
3. Sem superfície de relatórios consolidados (P/L por casa, yield por tipo, streaks, ROI rolling).

## Decisões (travadas no brainstorm)

1. Escopo = **automação + relatórios** (não reconstruir; sem downstream triggers de drawdown — fora de escopo, encosta em alertas).
2. Automação **sem scheduler externo**: snapshot vira efeito-colateral idempotente do ledger mudar.
3. Extrair métricas hoje inline para `lib/banca/metrics.ts` puro e testado (melhoria localizada da área que estamos tocando).

## Arquitetura

**Snapshots idempotentes, dirigidos por evento.** A RPC `resolve_bet` e os caminhos de escrita de `transactions` passam a chamar `generate_balance_snapshots(<data afetada>)` ao final, dentro da mesma transação. `generate_balance_snapshots` já é idempotente (INSERT … ON CONFLICT UPDATE por `(user_id, house_id, snapshot_date)`) — re-execução é segura. Lacunas de dias **sem atividade** não precisam de linha própria: as queries de relatório fazem *carry-forward* do último saldo conhecido (window function), então não há necessidade de cron diário.

```
resolve_bet(...)  ──┐
transaction insert ─┼─→ (mesma tx) → generate_balance_snapshots(date::date)  [idempotente]
                    ┘
daily_pl_view / roi_*_view → carry-forward via window p/ dias sem snapshot
```

**Views novas (SQL, migration nova):**
- `roi_by_house_view` — por casa: staked/returned resolvidos, ROI, yield, win_rate, bet_count, pending_stake.
- `roi_by_period_view` — por período (mês civil) e rolling-30d: mesmas métricas agregadas por janela.

Ambas derivam só de tabelas/colunas existentes (`bets`, `transactions`, `bet_selections`); RLS herdada das underlying tables (mesmo padrão de `house_balance_view`).

**Módulo de domínio:** `lib/banca/metrics.ts` — funções puras `computeRoi`, `computeYield`, `computeWinRate`, `computeMaxDrawdown`, `carryForwardSeries` — extraídas do cálculo inline de `app/(dashboard)/page.tsx`. Dashboard passa a importar daqui; `/banca` reusa.

**Superfície:** nova rota `app/(dashboard)/banca/page.tsx` (Server Component) consumindo as views: P/L por casa, yield por tipo de aposta (single/multiple/system), streaks de vitória/derrota, ROI rolling 30d, breakdown por mês. Reusa `lib/format.ts` (`fmt.*`) e o padrão de sparkline já usado no dashboard. Sem novos componentes de chart além dos já existentes.

## Modelo de dados

Sem novas tabelas. 1 migration nova: cria `roi_by_house_view` + `roi_by_period_view`; altera `resolve_bet` e o caminho de transação para chamar `generate_balance_snapshots` (idempotente, mesma tx). Sem DDL destrutivo; `CREATE OR REPLACE` nas funções/views.

## Error handling

- Snapshot dentro da mesma tx do resolve/transaction: falha no snapshot **não** pode reverter o resolve (é derivado). Estratégia: o trigger/RPC chama snapshot via bloco que loga e segue (`EXCEPTION WHEN OTHERS THEN RAISE WARNING`) — o ledger é fonte da verdade; snapshot é cache reconstruível. Documentar a invariante: "snapshot é reconstruível de transactions a qualquer momento".
- `/banca`: views vazias / usuário sem apostas → estado vazio amigável (sem erro).

## Testes (pirâmide TDD — testes primeiro)

- **Unit (`lib/banca/metrics.test.ts`):** ROI/yield/winrate/drawdown/carry-forward com casos de borda (sem apostas, só pendentes, netCapital=0, série com lacunas de dias).
- **Integração (SQL):** após `resolve_bet`, snapshot da data existe e é idempotente em re-chamada; `roi_by_house_view`/`roi_by_period_view` batem com cálculo manual num fixture conhecido (mesmo padrão de mock Supabase de `tests/integration/stats-page.test.tsx`).
- **Integração (page):** `/banca` renderiza com dados mockados; estado vazio.
- Regressão: dashboard `/` continua com os mesmos números após a extração para `lib/banca/metrics.ts` (snapshot dos valores antes/depois).

## Riscos / trade-offs

- Chamar snapshot dentro da tx de resolve adiciona custo a cada resolução — aceitável (1 usuário, baixa frequência; função já O(dia)).
- Carry-forward na query vs. linha-por-dia: escolhido query-side para não precisar de cron; custo é window function sobre poucas linhas (escala pessoal).

## Fora de escopo

Downstream triggers (alerta de drawdown, meta de banca), automação de entrada de resultado via API de odds, edição de aposta. YAGNI.
