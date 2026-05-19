# Design — Simulação como card recolhido + aba mobile dedicada

> **Status:** APROVADO pelo Pilot (Opção A, 2026-05-19). Aguardando plano de implementação (`writing-plans`) → subagent-driven TDD. NÃO implementado ainda.

## Problema

O painel de simulação (`SIM`) hoje é o **primeiro** slot de `buildPanels` com `colSpan: span 12` (full-width). No desktop (grid all-visible, sem abas em lugar nenhum desse dashboard) ele entra logo após o hero/odds e **empurra o gráfico de momentum pra baixo** — o Pilot quer o momentum de volta como primeiro gráfico, e a simulação acessível por clique.

## Decisão (Opção A — escolhida via AskUserQuestion)

Card recolhido clicável (não aba literal — desktop não tem sistema de abas; idiom-consistente). Opções B (segmented control novo) e C (âncora/scroll) foram descartadas pelo Pilot.

### Especificação

1. **Ordem desktop (`app/(dashboard)/fixtures/[id]/page.tsx` `buildPanels`):** `SIM` deixa de ser o índice 0. O painel de **momentum volta a ser o primeiro gráfico**; ordem dos demais painéis intacta. O card recolhido da simulação fica **logo após o momentum** (recomendado) — **DECISÃO MICRO EM ABERTO:** Pilot ainda não confirmou "após momentum" vs "fim do scroll" (pivotou pro bug da escalação antes de responder). Resolver no início da implementação.
2. **Card recolhido (desktop):** novo wrapper client `app/(dashboard)/fixtures/[id]/_components/simulation-disclosure.tsx` em volta do `SimulationPanel`:
   - Recolhido (default ≥768px): só header padrão `PanelShell` — "Simulação pré-jogo" + eyebrow "Monte Carlo" + botão "▸ ver". Sem corpo.
   - Expandido: chevron gira, "▸ ver"→"▾ ocultar", renderiza `SimulationPanel` completo in-place.
   - `<button aria-expanded aria-controls>`, navegável por teclado; tokens do design system (sem cor/spacing fora de escala — usar `PanelShell`/tokens existentes). `SimulationPanel` continua server-rendered; o wrapper client só alterna visibilidade (RSC-safe — recebe o painel como children).
3. **Mobile:** adicionar `{ id: "simulacao", label: "simulação", panels: ["SIM"] }` ao `MOBILE_TABS` em `components/fixtures/stats/stats-layout.tsx` (hoje SIM cai no fallback "visão"). Dentro da aba dedicada a simulação aparece **expandida** (a aba já é o clique-gate; sem duplo-gate). Implementação: o "recolher" é comportamento **só ≥768px via media query** — abaixo disso o corpo sempre aparece e o toggle some (sem acoplar contexto, SSR-safe).
4. **TDD (testes falham primeiro):** integração — (a) momentum aparece **antes** de SIM na ordem; (b) SIM recolhido por default no desktop, controle de expandir acessível; (c) clicar revela o conteúdo completo; (d) `MOBILE_TABS` tem aba "simulação" com SIM e SIM **não** está no fallback "visão"; (e) diretivas de produto seguem válidas quando expandido ("provável escalação" literal, nunca "oficial", "total do jogo", possession não renderizada, unsimulable gracioso). Guard de payload / repository intactos.

### Arquivos no escopo

- `app/(dashboard)/fixtures/[id]/page.tsx` — reordenar `buildPanels` (momentum 1º; SIM após) + envolver SIM no wrapper.
- novo `app/(dashboard)/fixtures/[id]/_components/simulation-disclosure.tsx` (client, disclosure).
- `components/fixtures/stats/stats-layout.tsx` — aba mobile "simulação" no `MOBILE_TABS`.
- `tests/integration/stats-page-simulation.test.tsx` (+ teste de layout se preciso).

(O antigo "page.tsx forbidden by T8" era escopo de paralelização das tasks da feature — obsoleto; aqui é mudança deliberada e aprovada.)

### Trade-off honesto

No desktop fica um *card recolhido*, não aba literal — é o idiom-consistente (desktop inteiro é scroll, sem aba em nenhum lugar). Sem regressão de perf (wrapper leve; SIM só renderiza corpo quando expandido no desktop / quando a aba ativa no mobile).
