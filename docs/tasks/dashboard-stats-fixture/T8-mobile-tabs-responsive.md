# Task: Mobile tabs + container queries refinement

> **Session:** Terminal 8 of 10 · **Branch:** `feat/dashboard-stats-T8` · **Status:** `[ ] Planning`

## Objective

Implementar a estratégia mobile: abaixo de 768px, layout vira `@radix-ui/react-tabs` (visão / streaks / jogos / players / odds). Refinar container queries em cada painel pra reorganizar conteúdo baseado em container, não viewport. Verificar overflow-x-auto pra heatmap.

## Required context

- **Larger feature:** [00-overview.md](00-overview.md)
- **Other sessions:** TODOS os painéis (T3-T7) devem existir. Este task **NÃO altera lógica**, apenas classes Tailwind/structure responsiva.

## Files ALLOWED

```
components/fixtures/stats/stats-layout.tsx           (re-edit pra adicionar tabs mobile)
components/fixtures/stats/panels/*.tsx               (refinar classes responsive only; não mexer em lógica)
components/fixtures/stats/hero.tsx                   (refinar responsive; manter mesma lógica)
app/globals.css                                      (apenas adicionar @container utilities se necessário; sem mexer em tokens)
+ relevant .test.tsx                                 (atualizar testes responsive)
```

## Files FORBIDDEN

```
lib/fixtures/stats/**
app/globals.css :root tokens                         (não tocar nas variáveis CSS principais)
app/(dashboard)/fixtures/[id]/stats/page.tsx         (T3)
```

## Execution order (TDD)

### Phase 1 — RED

- [ ] Test: renderiza tabs ao invés de grid quando viewport <768px.
- [ ] `pnpm test components/fixtures/stats/stats-layout` — vermelho.
- [ ] `git commit -m "test: mobile tabs scenarios"`

### Phase 2 — GREEN

- [ ] Em `stats-layout.tsx`:
  - Adicionar prop `tabs?: { id: string; label: string; panels: string[] }[]`.
  - Em `@container/main` abaixo de breakpoint mobile (~768px), renderiza `<Tabs.Root>` ao invés do grid 12-col. Cada tab content só monta os panels declarados.
  - Desktop ≥768px: grid 12-col normal (comportamento atual).
- [ ] Refinar cada painel pra usar `@container/card` queries:
  - Heatmap (F): `overflow-x-auto` quando container <520px.
  - Chips de F: `overflow-x-auto` + mask gradient nas bordas.
  - Tabela recent_matches (C+): colapsa colunas opcionais (`offsides`, `tackles`) abaixo de 600px.
  - Charts (B, K, L): single-column abaixo de 480px.
- [ ] `git commit -m "feat: mobile tabs + container queries refinement"`

### Phase 3 — REFACTOR

- [ ] Lint + typecheck.
- [ ] `git commit -m "chore: lint pass"` se aplicável.

### Phase 4 — VERIFICATION

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] DevTools: teste em viewport 360, 480, 768, 1024, 1440 px — sem layout broken.

## Acceptance criteria

- [ ] Tabs visíveis e funcionais em viewport <768px.
- [ ] Container queries: heatmap scrolla horizontalmente em mobile.
- [ ] Charts single-column abaixo de 480px.
- [ ] Hero mantém glow + KPIs em mobile (talvez 3-tile grid em vez de 6).

## Test scenarios

```
stats-layout mobile
  - viewport 360px → tabs root rendered (não grid)
  - default tab "visão" active
  - click "streaks" tab → mounts streaks-heatmap

panel responsive
  - heatmap overflow-x-auto active in narrow container
  - recent-matches table hides offsides column <600px
```

## Blockers

- Radix Tabs já instalado (sim, em `package.json`).

## Execution log
- Phase 1 (red): _pending_
- Phase 2 (green): _pending_
- Phase 3 (refactor): _pending_
- Phase 4 (verification): _pending_

## Notes for review
- Trade-offs: tabs vs scroll vertical longo — escolhi tabs pra evitar fadiga de scroll em 11 painéis.
