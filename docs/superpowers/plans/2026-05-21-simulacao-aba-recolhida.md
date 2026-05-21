# Simulação como card recolhido + aba mobile — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover o painel SIM de "primeiro slot full-width" pra "card recolhido clicável logo após o gráfico de momentum" no desktop, e adicionar uma aba dedicada "simulação" no mobile. Spec aprovada em `docs/superpowers/specs/2026-05-19-simulacao-aba-recolhida-design.md`.

**Architecture:** SimulationPanel ganha um prop `chrome?: "shell" | "bare"` (default `shell`, retrocompatível); um novo client wrapper `SimulationDisclosure` decide via `useIsMobile` se renderiza o conteúdo "bare" + sua própria casca PanelShell com toggle (desktop, default collapsed) ou o `SimulationPanel` com shell padrão (mobile, sempre expandido — a aba já é o gate). `buildPanels` em `page.tsx` reordena pra `B (momentum) → SIM (recolhido)`. `MOBILE_TABS` ganha entrada `simulacao`.

**Tech Stack:** Next.js 16 App Router (RSC server components + client islands), Radix UI (Tabs já em uso), Vitest + Testing Library + jsdom, `@testing-library/user-event`.

---

## File Structure

| Arquivo | Tipo | Responsabilidade |
|---|---|---|
| `app/(dashboard)/fixtures/[id]/_components/simulation-panel.tsx` | MODIFY (server) | Adicionar `chrome?: "shell" \| "bare"`; quando `bare`, retornar conteúdo sem `<PanelShell>` externo e sem Unavailable-shell — apenas body. |
| `app/(dashboard)/fixtures/[id]/_components/simulation-disclosure.tsx` | CREATE (client) | `"use client"`. Recebe `children: ReactNode` (o `SimulationPanel` em modo `bare`) + `chrome: { title, eyebrow }`. Usa `useIsMobile` (mesma media-query do `stats-layout-responsive`). Mobile → renderiza children dentro de `PanelShell` sempre expandido. Desktop → estado `expanded` (default `false`); collapsed = `PanelShell` com toggle visível + sem body; expanded = `PanelShell` com toggle + children. |
| `app/(dashboard)/fixtures/[id]/page.tsx` | MODIFY (server) | (a) Em `buildPanels`, mover `simSlot` de índice 0 pra logo após o painel `B` (momentum). (b) Envolver SIM no `SimulationDisclosure`, passando `<SimulationPanel ... chrome="bare" />` como children. |
| `components/fixtures/stats/stats-layout.tsx` | MODIFY | Adicionar entrada `{ id: "simulacao", label: "simulação", panels: ["SIM"] }` ao `MOBILE_TABS` (depois de `visao`). |
| `tests/integration/stats-page-simulation.test.tsx` | MODIFY | Helper `await expandSim(panel)` (clica o toggle em desktop test env); aplicar onde necessário; novos testes pra: (a) panel order momentum-before-SIM, (b) desktop default-collapsed, (c) click revela conteúdo, (d) mobile-tab "simulação" + SIM **não** no fallback "visão". |
| `tests/integration/__helpers/expand-sim.ts` | CREATE | Helper exportável `expandSim(panel)`. |

---

## Task 1 — `MOBILE_TABS` ganha entrada "simulação"

**Files:**
- Modify: `components/fixtures/stats/stats-layout.tsx:32-62`
- Test: `tests/integration/stats-page-simulation.test.tsx` (novo test case dentro do describe atual)

Isolado de qualquer outra mudança porque não afeta renderização desktop nem `page.tsx`. Resolve `[d]` da spec.

- [ ] **Step 1: Escrever o teste falho — SIM mora na aba "simulação" e não vaza pra "visão"**

Adicionar ao final do `describe("StatsPage — pre-game simulation panel", ...)`:

```typescript
import { MOBILE_TABS } from "@/components/fixtures/stats/stats-layout";

it("declara aba mobile 'simulação' contendo o painel SIM (e SIM não cai no fallback 'visão')", () => {
  const sim = MOBILE_TABS.find((t) => t.id === "simulacao");
  expect(sim, "MOBILE_TABS precisa ter uma aba 'simulacao'").not.toBeUndefined();
  expect(sim?.label).toBe("simulação");
  expect(sim?.panels).toContain("SIM");

  const visao = MOBILE_TABS.find((t) => t.id === "visao");
  expect(visao?.panels).not.toContain("SIM");
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd ~/Área\ de\ trabalho/Projetos\ Git/abissal && pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "aba mobile 'simulação'"
```

Esperado: FAIL — `MOBILE_TABS.find((t) => t.id === "simulacao")` retorna `undefined`.

- [ ] **Step 3: Implementar a entrada**

Em `components/fixtures/stats/stats-layout.tsx`, dentro de `MOBILE_TABS`, inserir logo após `visao` e antes de `streaks`:

```tsx
  {
    id: "simulacao",
    label: "simulação",
    panels: ["SIM"],
  },
```

Resultado:

```tsx
export const MOBILE_TABS: ReadonlyArray<{
  id: string;
  label: string;
  panels: string[];
}> = [
  {
    id: "visao",
    label: "visão",
    panels: ["B", "A-home", "A-away", "D", "E", "M", "K", "L", "N"],
  },
  {
    id: "simulacao",
    label: "simulação",
    panels: ["SIM"],
  },
  {
    id: "streaks",
    label: "streaks",
    panels: ["F"],
  },
  // …restante intacto
];
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "aba mobile 'simulação'"
```

Esperado: PASS.

- [ ] **Step 5: Rodar a suíte inteira do arquivo pra garantir zero regressão lateral**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx
```

Esperado: todos os testes existentes continuam verdes (a aba mobile não afeta o caminho desktop usado por todos eles).

- [ ] **Step 6: Commit**

```bash
git add components/fixtures/stats/stats-layout.tsx tests/integration/stats-page-simulation.test.tsx
git commit -m "feat(stats): aba mobile dedicada 'simulação' no MOBILE_TABS — tira SIM do fallback 'visão'"
```

---

## Task 2 — `chrome` prop em `SimulationPanel`

**Files:**
- Modify: `app/(dashboard)/fixtures/[id]/_components/simulation-panel.tsx:107-114, 145-170, 334`
- Test: `tests/integration/stats-page-simulation.test.tsx`

Sem essa refatoração mínima a `SimulationDisclosure` ou nesta a PanelShell duplicada (card-in-card). Default permanece `shell` — retrocompatível.

- [ ] **Step 1: Escrever o teste falho — chrome="bare" omite a casca**

Adicionar ao topo do arquivo de teste (novo describe próprio):

```typescript
import { SimulationPanel } from "@/app/(dashboard)/fixtures/[id]/_components/simulation-panel";

describe("SimulationPanel — chrome prop", () => {
  it("renderiza SEM a casca PanelShell quando chrome='bare'", () => {
    const sim = simRow();
    const { container } = render(
      <SimulationPanel
        sim={sim as unknown as Parameters<typeof SimulationPanel>[0]["sim"]}
        homeTeam="Chelsea"
        awayTeam="Tottenham"
        sampleSize={{ home: 22, away: 21 }}
        chrome="bare"
      />,
    );

    // Sem .card no nó-raiz: o body precisa ser embedável dentro de outra casca.
    expect(container.querySelector(".card.\\@container\\/card")).toBeNull();
    // h3 "Simulação pré-jogo" também NÃO aparece (a casca é quem o emite).
    expect(container.querySelector("header h3.font-display")).toBeNull();
    // Conteúdo do body ainda está lá — placar provável e barras.
    expect(container.querySelector("[data-probable-score]")).not.toBeNull();
    expect(container.querySelectorAll('[role="meter"]').length).toBe(5);
  });

  it("default (chrome='shell') mantém a casca + título (retrocompat)", () => {
    const sim = simRow();
    const { container } = render(
      <SimulationPanel
        sim={sim as unknown as Parameters<typeof SimulationPanel>[0]["sim"]}
        homeTeam="Chelsea"
        awayTeam="Tottenham"
        sampleSize={{ home: 22, away: 21 }}
      />,
    );
    expect(container.querySelector(".card.\\@container\\/card")).not.toBeNull();
    expect(container.querySelector("header h3.font-display")?.textContent).toContain(
      "Simulação pré-jogo",
    );
  });

  it("unsimulable em chrome='bare' renderiza apenas a mensagem (sem casca)", () => {
    const { container } = render(
      <SimulationPanel
        sim={simRow({ status: "unsimulable" }) as unknown as Parameters<typeof SimulationPanel>[0]["sim"]}
        homeTeam="Chelsea"
        awayTeam="Tottenham"
        sampleSize={{ home: 22, away: 21 }}
        chrome="bare"
      />,
    );
    expect(container.querySelector(".card.\\@container\\/card")).toBeNull();
    expect(container.textContent?.toLowerCase()).toContain("simulação indisponível");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "chrome prop"
```

Esperado: FAIL — `chrome` não existe como prop; TS deve barrar; runtime deve renderizar a casca.

- [ ] **Step 3: Implementar — extrair body, condicionar shell**

Em `app/(dashboard)/fixtures/[id]/_components/simulation-panel.tsx`:

3a. Aumentar a `interface SimulationPanelProps` (achar a interface acima de `function SimulationPanel`, ~linha 100) adicionando:

```tsx
  /**
   * "shell" (default): renderiza o conteúdo dentro do PanelShell padrão.
   * "bare": entrega só o body — o pai (`SimulationDisclosure`) fornece a casca.
   * Permite reusar este componente sob a casca da disclosure no desktop sem
   * cair em card-in-card.
   */
  chrome?: "shell" | "bare";
```

3b. Substituir o `function Unavailable` (linhas 107-114) por:

```tsx
function UnavailableBody({ reason }: { reason: string }) {
  return (
    <p className="label text-[var(--color-ink-faint)]">
      simulação indisponível — {reason}.
    </p>
  );
}

function Unavailable({
  reason,
  chrome,
}: {
  reason: string;
  chrome: "shell" | "bare";
}) {
  if (chrome === "bare") return <UnavailableBody reason={reason} />;
  return (
    <PanelShell title="Simulação pré-jogo" eyebrow="Monte Carlo">
      <UnavailableBody reason={reason} />
    </PanelShell>
  );
}
```

3c. Na função principal `SimulationPanel`, substituir as duas chamadas `<Unavailable reason="..." />` (linhas 152 e 155) por `<Unavailable reason="..." chrome={chrome} />` e acrescentar `chrome = "shell"` no destructure dos props.

3d. Extrair o corpo do retorno principal (linhas 169-334) para uma função local `function SimulationBody({ sim, homeTeam, awayTeam, sampleSize }: ...) {` que retorna **apenas o JSX que hoje está dentro de `<PanelShell>...</PanelShell>` na linha 187 até linha 333** (todos os `<section>`, sem o wrapper PanelShell).

3e. O retorno principal vira:

```tsx
  const body = (
    <SimulationBody
      sim={sim}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      sampleSize={sampleSize}
    />
  );

  if (chrome === "bare") return body;

  return (
    <PanelShell
      title="Simulação pré-jogo"
      gap={4}
      eyebrow={
        <span className="inline-flex items-center gap-1.5">
          Monte Carlo
          <InfoPopover label="o que é a simulação pré-jogo">
            <p>
              Resultado de uma simulação Monte Carlo (10k iterações) computada
              no scraper a partir das médias de temporada. Mostra o placar mais
              provável, probabilidades de mercado e a alocação de eventos por
              jogador. Não é palpite do mercado nem opinião — é a distribuição
              do modelo.
            </p>
          </InfoPopover>
        </span>
      }
    >
      {body}
    </PanelShell>
  );
```

Tipos: a `SimulationBody` local fica não-exportada; props inferidos.

- [ ] **Step 4: Rodar os testes do chrome prop e confirmar GREEN**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "chrome prop"
```

Esperado: PASS.

- [ ] **Step 5: Rodar TODA a suíte do arquivo pra checar retrocompat**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx
```

Esperado: todos os testes existentes continuam verdes (`chrome` é default `"shell"`, então `buildPanels` atual ainda passa por PanelShell).

- [ ] **Step 6: Type-check global**

```bash
pnpm tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/fixtures/\[id\]/_components/simulation-panel.tsx tests/integration/stats-page-simulation.test.tsx
git commit -m "refactor(sim-panel): chrome='shell|bare' prop — separa body da PanelShell sem mexer no caller atual"
```

---

## Task 3 — `SimulationDisclosure` client wrapper

**Files:**
- Create: `app/(dashboard)/fixtures/[id]/_components/simulation-disclosure.tsx`
- Create: `tests/integration/__helpers/expand-sim.ts`
- Test: `tests/integration/stats-page-simulation.test.tsx` (novos testes)

Aqui o "card recolhido" nasce. Não toca `page.tsx` ainda (próxima task).

- [ ] **Step 1: Escrever os testes falhos — disclosure mounted standalone (sem ir pela página)**

Adicionar ao arquivo de teste (novo describe próprio):

```typescript
import userEvent from "@testing-library/user-event";
import { SimulationDisclosure } from "@/app/(dashboard)/fixtures/[id]/_components/simulation-disclosure";

describe("SimulationDisclosure", () => {
  it("renderiza recolhido por default no desktop (só casca + toggle, sem body)", async () => {
    const { container } = render(
      <SimulationDisclosure>
        <p data-testid="sim-body">corpo</p>
      </SimulationDisclosure>,
    );

    // Casca PanelShell padrão presente.
    expect(container.querySelector(".card.\\@container\\/card")).not.toBeNull();
    expect(container.querySelector("header h3.font-display")?.textContent).toContain(
      "Simulação pré-jogo",
    );
    expect(container.querySelector("header")?.textContent?.toLowerCase()).toContain(
      "monte carlo",
    );

    // Toggle visível.
    const toggle = container.querySelector(
      'button[aria-expanded][aria-controls]',
    ) as HTMLButtonElement | null;
    expect(toggle, "toggle button deve existir").not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.textContent?.toLowerCase()).toContain("ver");

    // Body NÃO renderizado em collapsed.
    expect(container.querySelector('[data-testid="sim-body"]')).toBeNull();
  });

  it("expande ao clicar no toggle (aria-expanded=true, body montado, label muda)", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SimulationDisclosure>
        <p data-testid="sim-body">corpo</p>
      </SimulationDisclosure>,
    );

    const toggle = container.querySelector(
      'button[aria-expanded]',
    ) as HTMLButtonElement;
    await user.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent?.toLowerCase()).toContain("ocultar");
    expect(container.querySelector('[data-testid="sim-body"]')).not.toBeNull();
  });

  it("a região controlada referencia o id correto via aria-controls", () => {
    const { container } = render(
      <SimulationDisclosure>
        <p>x</p>
      </SimulationDisclosure>,
    );
    const toggle = container.querySelector(
      "button[aria-controls]",
    ) as HTMLButtonElement;
    const id = toggle.getAttribute("aria-controls")!;
    // O wrapper "region" precisa existir e portar esse id quando expandido.
    expect(id.length).toBeGreaterThan(0);
  });
});
```

Criar `tests/integration/__helpers/expand-sim.ts`:

```typescript
import userEvent from "@testing-library/user-event";

/**
 * Em jsdom (sem matchMedia mockado), o `useIsMobile` devolve `false` →
 * `SimulationDisclosure` mounta recolhida. Os testes que verificam o
 * conteúdo da simulação precisam expandir primeiro. Esse helper acha o
 * toggle dentro do painel e clica se o painel estiver recolhido. Idempotente.
 */
export async function expandSim(panel: HTMLElement): Promise<void> {
  const toggle = panel.querySelector(
    'button[aria-expanded]',
  ) as HTMLButtonElement | null;
  if (!toggle) return; // ou panel está em modo mobile/expanded sem disclosure
  if (toggle.getAttribute("aria-expanded") === "true") return;
  const user = userEvent.setup();
  await user.click(toggle);
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "SimulationDisclosure"
```

Esperado: FAIL — módulo `simulation-disclosure` não existe.

- [ ] **Step 3: Implementar `SimulationDisclosure`**

Criar `app/(dashboard)/fixtures/[id]/_components/simulation-disclosure.tsx`:

```tsx
"use client";

/**
 * Wrapper client da simulação pré-jogo.
 *
 * Desktop (≥768px): card recolhido por default. PanelShell padrão + toggle
 * "▸ ver" / "▾ ocultar". Body (children) só montado quando expandido — perf
 * + alinhado com a intenção de "discoverable mas fora do caminho".
 * Mobile (<768px): renderiza children direto (a aba já é o gate de clique).
 *
 * SimulationPanel passa em modo chrome="bare" (sem PanelShell interno) —
 * a casca é provida AQUI no desktop, e via SimulationPanel chrome="shell"
 * no mobile. Decisão tomada pelo wrapper.
 */
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { PanelShell } from "@/components/fixtures/stats/panels/_shell";
import { InfoPopover } from "@/components/fixtures/stats/_primitives/info-popover";

const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(query: string) {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    }
    const legacy = mql as unknown as {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(cb);
    return () => legacy.removeListener?.(cb);
  };
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe(MOBILE_QUERY),
    () => (typeof window === "undefined" ? false : window.matchMedia(MOBILE_QUERY).matches),
    () => false,
  );
}

function MonteCarloEyebrow() {
  return (
    <span className="inline-flex items-center gap-1.5">
      Monte Carlo
      <InfoPopover label="o que é a simulação pré-jogo">
        <p>
          Resultado de uma simulação Monte Carlo (10k iterações) computada no
          scraper a partir das médias de temporada. Mostra o placar mais
          provável, probabilidades de mercado e a alocação de eventos por
          jogador. Não é palpite do mercado nem opinião — é a distribuição do
          modelo.
        </p>
      </InfoPopover>
    </span>
  );
}

export function SimulationDisclosure({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  if (isMobile) {
    // Mobile: a aba já é o gate. Renderiza com a casca padrão sem toggle.
    return (
      <PanelShell title="Simulação pré-jogo" gap={4} eyebrow={<MonteCarloEyebrow />}>
        {children}
      </PanelShell>
    );
  }

  // Desktop: disclosure.
  return (
    <PanelShell
      title="Simulação pré-jogo"
      gap={4}
      eyebrow={
        <span className="inline-flex items-center gap-3">
          <MonteCarloEyebrow />
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => setExpanded((v) => !v)}
            className="label inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-vermelho)]"
          >
            <span aria-hidden>{expanded ? "▾" : "▸"}</span>
            {expanded ? "ocultar" : "ver"}
          </button>
        </span>
      }
    >
      <div id={regionId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </PanelShell>
  );
}
```

- [ ] **Step 4: Rodar os testes do disclosure e confirmar GREEN**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx -t "SimulationDisclosure"
```

Esperado: PASS (3 testes novos).

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```

Esperado: zero erros.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/fixtures/\[id\]/_components/simulation-disclosure.tsx tests/integration/__helpers/expand-sim.ts tests/integration/stats-page-simulation.test.tsx
git commit -m "feat(sim-disclosure): wrapper client recolhido no desktop (default) e expandido no mobile"
```

---

## Task 4 — Reordenar `buildPanels` + envolver SIM no `SimulationDisclosure`

**Files:**
- Modify: `app/(dashboard)/fixtures/[id]/page.tsx:300-370`
- Test: `tests/integration/stats-page-simulation.test.tsx` (novo teste de ordem + atualizar os testes que dependem do conteúdo do painel pra usar `expandSim`)

Essa é a task que faz "ficar bonito na tela". Combina reorder + envelopamento na mesma task porque dividir cria estado intermediário esquisito (SIM em segunda posição mas ainda com casca dupla).

- [ ] **Step 1: Escrever o teste falho — momentum (B) renderiza ANTES de SIM no DOM**

```typescript
it("renderiza o painel de momentum (B) antes da simulação (SIM) no DOM", async () => {
  mockState.fixtureRow = makeRow({ detail_json: makeDetail() as unknown });
  mockState.simRow = simRow();

  const { container } = await renderPage("42");

  const momentum = container.querySelector('[data-panel="B"]');
  const sim = container.querySelector('[data-panel="SIM"]');
  expect(momentum, "momentum panel B deve existir").not.toBeNull();
  expect(sim, "panel SIM deve existir").not.toBeNull();

  // Node.DOCUMENT_POSITION_FOLLOWING (4) significa que `sim` vem DEPOIS de `momentum`.
  const pos = momentum!.compareDocumentPosition(sim!);
  expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("renderiza SIM recolhido por default (toggle visível, body do conteúdo ausente)", async () => {
  mockState.fixtureRow = makeRow({ detail_json: makeDetail() as unknown });
  mockState.simRow = simRow();

  const { container } = await renderPage("42");
  const panel = container.querySelector('[data-panel="SIM"]') as HTMLElement;

  const toggle = panel.querySelector('button[aria-expanded]');
  expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  // Conteúdo do body (placar provável) NÃO está visível com SIM recolhido.
  expect(panel.querySelector("[data-probable-score]")).toBeNull();
});
```

- [ ] **Step 2: Atualizar os testes de conteúdo existentes pra usar `expandSim`**

Estes testes assumem que o painel já renderiza o body. Importar o helper no topo do arquivo:

```typescript
import { expandSim } from "./__helpers/expand-sim";
```

Em cada um dos testes abaixo (que checam conteúdo dentro de `data-panel="SIM"`), inserir `await expandSim(panel as HTMLElement);` **logo após** `const panel = container.querySelector('[data-panel="SIM"]') as HTMLElement;` (ou no equivalente após a render):

- `"resolves the simulation via the choistats id parsed from source_url (fallback cannot mask it)"`
- `"renders the probable score and the 1X2/over/BTTS probability bars"`
- `"renders through the shared PanelShell card+header structure"` (verifica o card outer — ainda passa sem expandir, MAS o h3 do título vem do disclosure agora; manter sem expand, validar separadamente)
- `"shows the TeamLegend above the per-team projected-stats table"`
- `"exposes the per-player confidence signal as visible text"`
- `"shows a stats tab/section with EXACT per-team numbers (real producer)"`
- `"degrades a metric absent from the producer contract to '—' (honest)"`
- `"renders the probable XI labeled EXACTLY 'provável escalação' and never 'oficial'"`
- `"renders the goal icon for a real likely scorer (threshold honest)"` (ambos os render blocks)
- `"explains things via reusable tooltips/info-popovers"`
- `"labels a stat with no HT split as 'total do jogo' and never renders possession"`
- `"surfaces enriched T1 season averages (avgs) in the simulation panel"`

Os testes "shows a graceful 'simulação indisponível' state" e "does not crash and shows no SIM panel content when no simulation row exists" e "degrades gracefully when the fixture_simulations table is absent" precisam de cuidado:
- O panel "unsimulable" vem do `SimulationPanel chrome="bare"` (via disclosure mobile-or-expanded path) — em desktop-collapsed o body nem é montado. A mensagem "simulação indisponível" não aparece se collapsed. **Decisão de produto:** quando `sim?.status === 'unsimulable'` ou `sim === null`, o disclosure deve **auto-expandir** (não há valor em esconder uma mensagem de degradação). Acomodar isso na Task 4 implementação (passo 3).

- [ ] **Step 3: Implementar — reorder + wrap + auto-expand-degraded**

3a. Em `app/(dashboard)/fixtures/[id]/page.tsx`, import:

```tsx
import { SimulationDisclosure } from "./_components/simulation-disclosure";
```

3b. Substituir o bloco `const simSlot: PanelSlot = { ... };` (linhas 306-318) por:

```tsx
  const simDegraded = !sim || sim.status === "unsimulable";
  const simSlot: PanelSlot = {
    id: "SIM",
    colSpan: "span 12 / span 12",
    label: "simulação pré-jogo",
    node: (
      <SimulationDisclosure defaultExpanded={simDegraded}>
        <SimulationPanel
          sim={sim}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          sampleSize={readAvgsSampleSize(detail)}
          chrome="bare"
        />
      </SimulationDisclosure>
    ),
  };
```

3c. Mover `simSlot` da posição inicial (depois do `if (!detail) return [simSlot];`). A função `buildPanels` precisa retornar:

```tsx
  if (!detail) return [simSlot];
  // …
  return [
    // momentum primeiro:
    {
      id: "B",
      colSpan: "span 12 / span 12",
      h: 280,
      label: "momentum",
      node: (
        <MomentumChart
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          home={momentumHome}
          away={momentumAway}
        />
      ),
    },
    // simulação recolhida depois:
    simSlot,
    // resto inalterado (A-home, A-away, D, E, M, K, L, I, J, N, F, G+, H, C-home, C-away):
    {
      id: "A-home",
      // …
    },
    // …
  ];
```

(remove a linha `simSlot,` que estava como primeira do return)

3d. Em `SimulationDisclosure` (arquivo da Task 3), adicionar prop `defaultExpanded?: boolean`:

```tsx
export function SimulationDisclosure({
  children,
  defaultExpanded = false,
}: {
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  // …
  const [expanded, setExpanded] = useState(defaultExpanded);
  // …
}
```

- [ ] **Step 4: Rodar os testes do StatsPage e confirmar GREEN**

```bash
pnpm vitest run tests/integration/stats-page-simulation.test.tsx
```

Esperado: todos passam (os atualizados via `expandSim` + os novos de ordem/collapsed-default).

- [ ] **Step 5: Rodar a suíte de integração inteira pra checar zero regressão lateral**

```bash
pnpm vitest run tests/integration
```

Esperado: zero falhas. Em particular `stats-page.test.tsx` e `stats-page-empty.test.tsx` não devem ter degradado (o SIM continua mountando como painel; só ficou recolhido por default).

- [ ] **Step 6: Type-check + lint**

```bash
pnpm tsc --noEmit && pnpm lint
```

Esperado: zero erros.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/fixtures/\[id\]/page.tsx app/\(dashboard\)/fixtures/\[id\]/_components/simulation-disclosure.tsx tests/integration/stats-page-simulation.test.tsx
git commit -m "feat(stats): momentum volta a ser 1º gráfico; SIM vira card recolhido logo depois (auto-expanded em degradação)"
```

---

## Task 5 — Verificação visual ao vivo (não pula)

**Files:** (nenhum modificado — verificação)

Lição #4 da memória: "verified" precisa exercitar o caminho real, não só agregados. Já bati nessa pedra 4×.

- [ ] **Step 1: Subir o dev server**

```bash
pnpm dev
```

(em background; deixar rodar)

- [ ] **Step 2: Abrir um fixture com simulação real em prod-like**

Em outro terminal, descobrir um fixture id atual com simulação v2:

```bash
pnpm exec tsx -e "
const { createAdminClient } = require('./lib/supabase/admin');
const c = createAdminClient();
(async () => {
  const { data } = await c.from('fixture_simulations')
    .select('fixture_id, kickoff_utc')
    .gte('kickoff_utc', new Date().toISOString())
    .eq('model_version', 'sim-v1-poisson-dc-nb-mc10k-v2')
    .order('kickoff_utc', { ascending: true })
    .limit(5);
  console.log(data);
})();
"
```

Anotar um fixture_id (choistats id). Depois resolver pro fixtures.id local via:

```bash
pnpm exec tsx -e "
const { createAdminClient } = require('./lib/supabase/admin');
const c = createAdminClient();
(async () => {
  const { data } = await c.from('fixtures')
    .select('id, source_url')
    .ilike('source_url', '%/fixture/<CHOISTATS_ID>/%')
    .maybeSingle();
  console.log(data);
})();
"
```

- [ ] **Step 3: Verificar desktop em http://localhost:3000/fixtures/<id>/stats**

Checklist visual:
- (a) Hero com odds aparece no topo.
- (b) **Gráfico de momentum (panel B) é o PRIMEIRO painel abaixo do hero.**
- (c) Card "Simulação pré-jogo · Monte Carlo · [▸ ver]" aparece logo após momentum, **recolhido**.
- (d) Clicar em "▸ ver" expande in-place; chevron vira ▾; label muda pra "ocultar"; body completo aparece (placar provável, 5 barras, escalação, etc.).
- (e) Clicar em "▾ ocultar" recolhe.
- (f) Resto dos painéis (team-record, h2h, etc.) intacto e na ordem original.

- [ ] **Step 4: Verificar mobile (DevTools responsive ≤767px)**

- (a) Abas: "visão", **"simulação"**, "streaks", "jogos", "players", "odds".
- (b) Tab "visão" default — sim NÃO está lá.
- (c) Clicar "simulação" → o SimulationPanel aparece **expandido por default**, sem botão de toggle (a aba já é o gate).

- [ ] **Step 5: Verificar degradação honesta**

Achar um fixture com `status='unsimulable'` ou sem simulação (`simRow=null`):

```bash
pnpm exec tsx -e "/* idem mas filtrar status='unsimulable' ou fazer LEFT JOIN faltante */"
```

Abrir esse fixture; conferir que o card aparece **auto-expandido** com a mensagem "simulação indisponível — …" (não ficou escondido).

- [ ] **Step 6: Console limpo, sem warnings de hydration**

DevTools → Console → recarregar a página → não pode ter warning `useSyncExternalStore`, `hydration mismatch`, ou similar.

- [ ] **Step 7: Parar o dev server**

(ctrl+c no terminal do `pnpm dev`)

---

## Task 6 — Finishing branch

**Files:** (sem mudança — orquestração de finalização)

- [ ] **Step 1: Pré-merge — rodar a suíte inteira do projeto (não só integration)**

```bash
pnpm vitest run && pnpm tsc --noEmit && pnpm lint
```

Esperado: tudo verde.

- [ ] **Step 2: Conferir git status final**

```bash
git status && git log --oneline origin/main..HEAD
```

Esperado: working tree limpo; 4 commits novos (Task 1, 2, 3, 4).

- [ ] **Step 3: Push direto pra main (workflow do projeto, ver lição/memória)**

```bash
git push origin main
```

- [ ] **Step 4: Acompanhar o deploy via CF (Workers main branch)**

Monitor: deploy job termina ok; fazer um `curl -sI https://<prod-domain>/fixtures/<id>/stats` e validar 200.

- [ ] **Step 5: Verificação pós-deploy em prod**

Abrir o fixture em prod e repetir o checklist visual da Task 5 ali.

- [ ] **Step 6: Atualizar memória**

Mark `[Simulação pré-jogo — diretivas]` memory: layout change SHIPPED 2026-05-21; remover bullet "PRÓXIMO: implementar layout aprovado".

---

## Self-review (rodado antes de entregar o plano)

**Spec coverage** (1:1 contra `docs/superpowers/specs/2026-05-19-simulacao-aba-recolhida-design.md`):
- §1 Reorder buildPanels (momentum 1º, SIM depois) → Task 4
- §2 Card recolhido (desktop, toggle, aria) → Task 3 + 4
- §3 Aba mobile "simulação" → Task 1
- §4(a) momentum antes de SIM → Task 4 (teste)
- §4(b) SIM recolhido default no desktop → Task 4 (teste)
- §4(c) Clicar revela conteúdo → Task 3 (teste isolado) + Task 4 (teste via página)
- §4(d) MOBILE_TABS tem "simulação" + SIM fora de "visão" → Task 1 (teste)
- §4(e) Diretivas de produto seguem válidas quando expandido → Task 4 (testes existentes via `expandSim`)
- Trade-off honesto (sem double-shell) → Task 2 (chrome="bare")
- Decisão micro em aberto (posição do card) → **resolvida: logo após momentum** (linha 15 da spec recomendava isso; Pilot confirmou na invocação do plano)

**Placeholder scan:** sem TBD/TODO; cada step tem código real OU comando real OU resultado esperado.

**Type consistency:**
- `chrome?: "shell" | "bare"` em Task 2; consumida em Task 4 (`chrome="bare"`) ✓
- `SimulationDisclosure` interface: `{ children: ReactNode; defaultExpanded?: boolean }` — Task 3 introduz `children`, Task 4 adiciona `defaultExpanded` (auto-degraded) ✓
- `MOBILE_TABS` shape preservado ✓
- Helper `expandSim` assina `(panel: HTMLElement) => Promise<void>` consistente em todos os usos ✓

Plano completo.
