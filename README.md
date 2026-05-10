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

## Deploy (Cloudflare Workers via OpenNext)

Hospedado como Cloudflare Worker — não Pages. O adapter `@opennextjs/cloudflare`
empacota o build do Next.js (incluindo Server Actions e middleware) em um worker
único e serve `/_next/static` via asset binding.

### Scripts locais

| Comando | Função |
|---|---|
| `pnpm cf:build` | Compila Next.js + adapta para worker em `.open-next/` |
| `pnpm cf:preview` | Build + `wrangler dev` em `localhost:8787` (worker real) |
| `pnpm cf:deploy` | Build + `wrangler deploy` (push para produção) |
| `pnpm cf:upload` | Sobe nova versão sem promovê-la (canary / rollback) |

### Setup inicial na Cloudflare (uma vez)

1. **Criar API token** em <https://dash.cloudflare.com/profile/api-tokens>
   com o template *“Edit Cloudflare Workers”*. Guardar no GitHub como o
   secret `CLOUDFLARE_API_TOKEN`. Anotar o `Account ID` (sidebar do dashboard)
   como `CLOUDFLARE_ACCOUNT_ID`.
2. **Cadastrar secrets do Supabase + Sentry** no GitHub Actions:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SENTRY_DSN` (opcional)
3. **Cadastrar os mesmos valores no worker** (em produção) com:
   ```bash
   pnpm dlx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
   pnpm dlx wrangler secret put NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   ```
4. **Domínio custom**:
   - No dashboard CF → Workers & Pages → `abissal` → *Triggers* →
     *Add Custom Domain* → `abissal.rnobre.dev`.
   - Cloudflare cria o CNAME automaticamente se `rnobre.dev` já estiver
     na sua conta. Se o DNS estiver fora, criar um `CNAME abissal → abissal.<conta>.workers.dev`.

### Pipeline

- `main` → `deploy.yml` no GitHub Actions roda `pnpm cf:build` e
  `wrangler deploy`.
- Branches de PR → apenas `ci.yml` (lint + typecheck + tests + build).
  Previews com URL única exigem `wrangler versions upload` no fluxo —
  vem na próxima iteração.
