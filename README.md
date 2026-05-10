# Abissal

Plataforma pessoal de gestão de banca de apostas. Single-user no MVP, multi-tenant
mais adiante. Auditoria total. Dashboard com qualidade de mercado financeiro.

> Estética e princípios derivados do Design System **Abismo Habitado** v1.0.

## Stack

- **Next.js 16** (App Router, RSC, Server Actions) + TypeScript + React 19
- **Tailwind CSS v4** com tokens Abismo via `@theme`
- **Supabase** (Postgres 16 + Auth + RLS + Edge Functions + Storage) — região `sa-east-1`
- **DuckDB-WASM** para OLAP client-side em `/explore`
- **lightweight-charts** + **Recharts** + **Visx** para gráficos
- **TanStack Query** + **Zustand** para estado client
- **Zod** + **react-hook-form** para formulários
- **simple-statistics** + **regression** para estatística (níveis 1-3, 6, 7)
- **Cloudflare Pages** para hospedagem em `abissal.rnobre.dev`

## Setup local

```bash
pnpm install
cp .env.example .env.local   # já preenchido localmente; nunca commitar .env.local
pnpm dev
```

## Scripts

| Comando | Função |
|---|---|
| `pnpm dev` | servidor de desenvolvimento (turbopack) |
| `pnpm build` | build de produção |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | testes unitários (Vitest) |
| `pnpm test:e2e` | testes E2E (Playwright, mobile + desktop viewports) |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |

## Estrutura

```
app/                       # rotas Next.js (App Router)
components/                # UI + charts + layout + domain
lib/
  env.ts                   # validação Zod das envs
  format.ts                # currency / percent / mono no pt-BR
  utils.ts                 # cn()
  supabase/                # browser + server clients + tipos gerados
  stats/                   # bankroll, forecast, risk, streaks
  duckdb/                  # client-side OLAP
supabase/
  migrations/              # 0001_init.sql, 0002_audit_triggers.sql, ...
  functions/               # Edge Functions Deno
tests/
  unit/                    # Vitest
  e2e/                     # Playwright
```

## Convenções de Design System

- Toda página vive sobre `--color-void` com textura `strata`.
- Números **sempre** em `font-mono` com `tabular-nums` (use a classe `.num`).
- Headings em Fraunces 300 com tracking negativo.
- Vermelho Garantido (`--color-vermelho`) é **identidade e ruptura**, nunca erro genérico.
- Erros do sistema usam `--color-warning`.
- Saldo financeiro nominal usa `--color-depth-hi`. Saldo positivo histórico fica branco (fato, não emoção).

## Domain model (resumo)

`houses` ← `transactions` (append-only) → `bets` ← `bet_selections` & `bet_events`.
`audit_log` captura toda mutação via trigger Postgres.
`balance_snapshots` é regenerado pela Edge Function diária.

Detalhes completos no plano de implementação.

## Deploy

Branch `main` → produção em `abissal.rnobre.dev` via Cloudflare Pages.
Branch `claude/*` → preview deploy automático.
