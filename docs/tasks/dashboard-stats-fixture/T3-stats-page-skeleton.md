# Task: page.tsx + StatsLayout + Hero

> **Session:** Terminal 3 of 10 · **Branch:** `feat/dashboard-stats-T3` · **Status:** `[ ] Planning`

## Objective

Criar a rota `/fixtures/[id]/stats` (Server Component), o wrapper `<StatsLayout>` (grid 12-col + container queries Tailwind v4), e o `<Hero>` (Stadium Wall com glow vermelho — kickoff, 1X2 odds, KPI tiles). Renderiza com placeholders para painéis enquanto T4-T7 ainda não rodam.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** T1 fornece types/derivers (consumido aqui). T4-T7 vão preencher os slots de painéis dentro do `<StatsLayout>`.
- **Decisões:** anatomia desktop/mobile em [00-overview.md](00-overview.md). Hero estilo "Stadium Wall" — glow via `--shadow-glow-vermelho`.
- **CLAUDE.md sections:** §design-system (tokens), §next-conventions.

## Files ALLOWED

```
app/(dashboard)/fixtures/[id]/stats/page.tsx
components/fixtures/stats/stats-layout.tsx
components/fixtures/stats/hero.tsx
components/fixtures/stats/skeleton.tsx
app/(dashboard)/fixtures/[id]/page.tsx     (apenas adicionar link "abrir stats →" no header; nada mais)
```

## Files FORBIDDEN

```
components/fixtures/stats/panels/**       (T4, T5, T6, T7)
lib/fixtures/stats/**                      (T1, T2; read-only via import)
supabase/**
app/globals.css                            (T8)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Escrever `tests/integration/stats-page.test.tsx` cobrindo:
  - renderiza com fixture válido (mock Supabase admin)
  - 404 quando ID inválido
  - hero mostra teams + kickoff BRT formatado
- [ ] `pnpm test tests/integration/stats-page` — vermelho.
- [ ] `git commit -m "test: stats page skeleton scenarios"`

### Phase 2 — GREEN

- [ ] Criar `app/(dashboard)/fixtures/[id]/stats/page.tsx`:
  - `export const dynamic = "force-dynamic"`
  - Fetch via `createAdminClient` (mesmo padrão de `app/(dashboard)/fixtures/[id]/page.tsx`)
  - `notFound()` se ID inválido ou fixture ausente
  - Roda derivers de T1 com `detail_json` (graceful em null)
  - Renderiza `<StatsLayout hero={<Hero ... />} panels={[]} />` (slots vazios por ora)
- [ ] Criar `components/fixtures/stats/stats-layout.tsx`:
  - Wrapper `<main>` mx-auto max-w-7xl px-4 lg:px-8 py-8
  - `<header>` com breadcrumb back to `/fixtures/[id]` (AnalyzePanel IA)
  - `<section data-panels>` com grid 12-col + gap
  - Cada panel slot tem `<Suspense fallback={<PanelSkeleton h={...}/>}>` boundary
- [ ] Criar `components/fixtures/stats/hero.tsx` (Client):
  - Display teams + kickoff_brt
  - 6 KPI tiles: 1, X, 2, over 2.5%, btts%, ref cards (derive from props)
  - Aplica `--shadow-glow-vermelho` + `text-shadow` nos numbers
  - Quando `detail_json === null`: msg "stats em breve — scraper atualiza diariamente"
- [ ] Criar `components/fixtures/stats/skeleton.tsx`:
  - `<PanelSkeleton h=... />` com shimmer CSS (linear-gradient animation)
- [ ] Adicionar link "abrir stats →" em `app/(dashboard)/fixtures/[id]/page.tsx` (header próximo ao "← voltar")
- [ ] Tests verde. `git commit -m "feat: stats page skeleton + Hero + StatsLayout"`

### Phase 3 — REFACTOR

- [ ] Extrair `<KpiTile>` se hero tiver 6 tiles repetidos.
- [ ] `git commit -m "refactor: hero kpi tile"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm dev`, abrir `/fixtures/<id-real>/stats` — hero renderiza, layout não dá erro.

## Acceptance criteria

- [ ] Rota acessível, retorna 200 com fixture válido.
- [ ] Hero exibe teams, kickoff_brt, 6 KPI tiles com glow vermelho.
- [ ] Layout responsivo: desktop grid 12-col, mobile stack (container query base).
- [ ] Skeleton anima durante Suspense.
- [ ] `notFound()` retorna 404 nativo.
- [ ] Link "abrir stats" presente em `/fixtures/[id]` page.

## Test scenarios

```
StatsPage
  - 200 + hero render with valid fixture
  - 404 with invalid id
  - 404 with non-existent id
  - hero shows "stats em breve" when detail_json is null
  - hero renders KPI tiles with computed values (over_pct, btts_pct, ref_avg_bp)

StatsLayout
  - renders hero + panels container
  - Suspense boundary present per panel slot

Hero
  - renders 6 KPI tiles when data present
  - shows fallback message when data null
```

## Blockers

- T1 não mergeado → tipos ausentes; aguardar.
- next.config.ts route detection issue → não mexer config, avisar.

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## State on pause
- Done: —
- In progress: —
- Exact next step: aguardar T1, escrever test scenarios.

## Notes for review
- Trade-offs: usar `force-dynamic` em vez de ISR — uso pessoal, baixo tráfego.
- Deferred: animações de entrada do hero (T8 polish).
