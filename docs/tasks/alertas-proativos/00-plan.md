# Alertas Proativos In-App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Destacar proativamente os jogos de alto sinal do dia, in-app: `isHighSignal()` puro, seção "⚡ Destaques do dia" no dashboard, realce no `FixtureCard` da `/fixtures`, e dismiss persistido.

**Architecture:** Avaliação 100% read-time reusando `computeBadges()`/`computeFixtureSignals()` já existentes (sem job, sem canal externo). 1 tabela mínima `alert_dismissals` para "já visto".

**Tech Stack:** Next.js 16 RSC + Server Actions, Supabase Postgres (1 migration + RLS), TypeScript, Vitest.

**Spec:** `docs/pesquisas/alertas-proativos-design.md`

---

## File Structure

- Create: `lib/alerts/is-high-signal.ts` — função pura `isHighSignal`.
- Create: `lib/alerts/is-high-signal.test.ts` — unit.
- Create: `supabase/migrations/0015_alert_dismissals.sql` — tabela + RLS + grants.
- Create: `app/(dashboard)/_components/destaques-do-dia.tsx` — seção do dashboard (Server Component + Server Action de dismiss).
- Modify: `app/(dashboard)/page.tsx` — renderiza `<DestaquesDoDia/>`.
- Modify: `components/fixtures/fixture-card.tsx` — prop `highSignal` → realce.
- Modify: `app/(dashboard)/fixtures/page.tsx` — deriva `highSignal` por fixture e passa ao card.
- Test: `tests/integration/destaques-do-dia.test.tsx`, `tests/unit/fixture-card-highlight.test.tsx`.

> Migration FIXADA em `0015_alert_dismissals.sql` (loop-banca usa 0014, calibração 0016 — sem colisão).

---

## Task 1: `lib/alerts/is-high-signal.ts` (puro)

**Files:** Create `lib/alerts/is-high-signal.ts`, Test `lib/alerts/is-high-signal.test.ts`

Contexto: `computeBadges(detail): Badge[]` em `lib/fixtures/badges.ts:44` retorna até 3 badges. Regra inicial: **≥2 badges = alto sinal**. A função recebe a lista de badges já computada (não recomputa — desacopla de `detail_json`).

- [ ] **Step 1: Testes falhando**

```ts
import { describe, it, expect } from "vitest";
import { isHighSignal, HIGH_SIGNAL_MIN_BADGES } from "./is-high-signal";

describe("isHighSignal", () => {
  it("≥2 badges → true", () => {
    expect(isHighSignal(["cartao-alto", "over-alto"])).toBe(true);
    expect(isHighSignal(["cartao-alto", "over-alto", "btts-alto"])).toBe(true);
  });
  it("0 ou 1 badge → false", () => {
    expect(isHighSignal([])).toBe(false);
    expect(isHighSignal(["over-alto"])).toBe(false);
  });
  it("threshold é o único ponto de decisão (constante exportada)", () => {
    expect(HIGH_SIGNAL_MIN_BADGES).toBe(2);
  });
  it("entrada não-array → false (defensivo)", () => {
    // @ts-expect-error teste de robustez
    expect(isHighSignal(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — FAIL** (`pnpm test lib/alerts/is-high-signal.test.ts`).
- [ ] **Step 3: Implementar** — `export const HIGH_SIGNAL_MIN_BADGES = 2;` e `export function isHighSignal(badges: string[]): boolean { return Array.isArray(badges) && badges.length >= HIGH_SIGNAL_MIN_BADGES; }` (tipo do badge: importar o tipo `Badge` de `lib/fixtures/badges.ts` se exportado; senão `string[]`).
- [ ] **Step 4: Rodar — PASS.**
- [ ] **Step 5: Commit** — `test+feat(alerts): isHighSignal() puro (≥2 badges)`.

## Task 2: Migration `alert_dismissals` + RLS

**Files:** Create `supabase/migrations/0015_alert_dismissals.sql`

- [ ] **Step 1: Teste de integração falhando** — `tests/integration/alert-dismissals.test.ts`: insere dismissal via client autenticado mockado e lê de volta filtrando por `user_id`; assert PK `(user_id, fixture_id)` impede duplicata (segundo insert é no-op/erro tratado); RLS impede ler de outro user (replicar padrão de teste de RLS já usado no repo se houver; senão, testar a query app-side).
- [ ] **Step 2: Rodar — FAIL** (tabela não existe).
- [ ] **Step 3: Escrever a migration**

```sql
create table if not exists public.alert_dismissals (
  user_id uuid not null references auth.users(id) on delete cascade,
  fixture_id bigint not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, fixture_id)
);
alter table public.alert_dismissals enable row level security;
create policy alert_dismissals_owner on public.alert_dismissals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, delete on public.alert_dismissals to authenticated;
```

(Sem FK para `fixtures` — fixture é purgada em 3 dias; linha órfã é inócua. Seguir o padrão exato de RLS/grant das tabelas de usuário existentes — conferir uma migration de tabela com `auth.uid()` no repo e espelhar.)

- [ ] **Step 4: Aplicar no Postgres de teste + rodar — PASS.**
- [ ] **Step 5: Commit** — `feat(alerts): tabela alert_dismissals + RLS por usuário`.

## Task 3: Realce no `FixtureCard` da `/fixtures`

**Files:** Modify `components/fixtures/fixture-card.tsx`, Modify `app/(dashboard)/fixtures/page.tsx`, Test `tests/unit/fixture-card-highlight.test.tsx`

- [ ] **Step 1: Teste falhando** — render de `FixtureCard` com prop `highSignal={true}` aplica a classe/atributo de realce (ex.: `data-high-signal="true"` + classe de acento do design system); com `false` ou ausente não aplica; badges existentes continuam renderizando igual (sem regressão — assert que os badges ainda aparecem nos dois casos).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — adicionar prop opcional `highSignal?: boolean` ao `FixtureCard`; quando true, adicionar `data-high-signal="true"` e uma classe de acento usando tokens existentes do design system (inspecionar classes já usadas no card para badges/acento — reusar, não inventar cor). Em `app/(dashboard)/fixtures/page.tsx`, onde a lista é montada (o Server Component que já chama `computeBadges` para exibir badges — reusar o MESMO array de badges já computado, sem segunda chamada), derivar `isHighSignal(badges)` por fixture e passar ao card.
- [ ] **Step 4: Rodar — PASS**; `pnpm typecheck`.
- [ ] **Step 5: Commit** — `feat(alerts): realce de alto sinal no FixtureCard da /fixtures`.

## Task 4: Seção "⚡ Destaques do dia" + dismiss

**Files:** Create `app/(dashboard)/_components/destaques-do-dia.tsx`, Modify `app/(dashboard)/page.tsx`, Test `tests/integration/destaques-do-dia.test.tsx`

- [ ] **Step 1: Teste falhando** — Server Component `<DestaquesDoDia/>` com Supabase mockado:
  - lista só fixtures da janela BRT de hoje com `isHighSignal(badges)` e `fixture_id` NÃO presente em `alert_dismissals` do usuário;
  - cada item: jogo, liga, horário, badges, link `/fixtures/<id>`, botão "dispensar";
  - clicar "dispensar" chama Server Action que insere em `alert_dismissals` e o item some (revalidatePath);
  - lista vazia → componente não renderiza nada (sem header órfão).
- [ ] **Step 2: Rodar — FAIL.**
- [ ] **Step 3: Implementar** — Server Component que reusa o repositório de fixtures já usado pela `/fixtures` (mesma fonte/janela BRT — NÃO duplicar a query logic; importar o helper existente), computa badges (reusa `computeBadges`), filtra por `isHighSignal`, faz LEFT de `alert_dismissals` do usuário (1 query: `select fixture_id from alert_dismissals where user_id = …`), exclui dispensadas. Server Action `dismissAlert(fixtureId)` em arquivo `actions.ts` colocalizado: valida sessão (padrão das outras actions do dashboard), `insert ... on conflict do nothing`, `revalidatePath('/')`. Render compacto reusando componentes de UI existentes.
- [ ] **Step 4: Render no dashboard** — em `app/(dashboard)/page.tsx`, inserir `<DestaquesDoDia/>` no topo da visão geral (acima dos cards de banca). Não alterar o resto da página.
- [ ] **Step 5: Rodar — PASS**; `pnpm lint && pnpm typecheck`.
- [ ] **Step 6: Commit** — `feat(alerts): seção Destaques do dia no dashboard + dismiss persistido`.

## Task 5: Gate final

- [ ] **Step 1:** `pnpm lint` (0 erros) `&& pnpm typecheck` `&& pnpm test` (suíte verde).
- [ ] **Step 2:** Verificar: nenhuma query extra de `detail_json` adicionada (badges reusados do array já computado na `/fixtures`); `/` só ganhou a seção, resto intacto.
- [ ] **Step 3: Commit** se houver ajuste — `chore(alerts): gate verde`.

---

## Self-Review

- **Cobertura do spec:** isHighSignal puro (T1) ✓; alert_dismissals + RLS (T2) ✓; realce FixtureCard (T3) ✓; Destaques do dia + dismiss read-time (T4) ✓; sem job/canal externo ✓; reuso de badges sem query extra (T3/T4) ✓.
- **Placeholders:** nenhum; SQL e contratos concretos, código de teste real.
- **Consistência:** `isHighSignal(badges:string[]):boolean` + `HIGH_SIGNAL_MIN_BADGES` fixos em T1 e reusados em T3/T4; `dismissAlert(fixtureId)` definido em T4.
- **Risco:** numeração de migration vs. plano paralelo (nota no File Structure); confirmar tipo `Badge` exportado por `lib/fixtures/badges.ts` (senão usar `string[]`).
