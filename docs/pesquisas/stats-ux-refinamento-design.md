# Design — Refinamento UX dos painéis de stats

> **Status:** APPROVED · **Data:** 2026-05-15 · **Owner:** Rafael Nobre
> **Origem:** feedback sobre 5 painéis confusos em `/fixtures/[id]/stats` (feature `dashboard-stats-fixture`, já em prod).
> **Brainstorm:** `.superpowers/brainstorm/1129158-1778869730/` (companion mockups).

## Problema

5 painéis não comunicam bem (feedback do Pilot com prints):

| Painel | Sintoma | Causa raiz |
|---|---|---|
| Scatter playground (L) | "não sei que eixos escolher nem ler o R" | R sem interpretação; sem legenda de cor; sem presets; sem leitura |
| Predictions (J) | "confuso de qual time, tudo vermelho" | colunas de evidência sem cabeçalho de time; chip sempre vermelho |
| Insights (N) | "escrita não ficou clara" | texto estatístico cru; não diz o que significa pra aposta; ícones crípticos; correlações tautológicas (cartões×booking r=1.00) |
| Players scatter (G+) | "tooltip ruim, não tiro insight" | `eff/90: 0.4525455688246386` float cru; sem nome; sem eixo rotulado |
| Recent-matches (C+) | "só linhas, não diz nada" | sem eixo Y; sem valor nos pontos; spline distorce; linha de referência sem legenda |

**Fio condutor:** falta de contexto explicativo + diferenciação fraca de time (tudo vermelho).

## Decisões (locked no brainstorm)

1. **Filosofia:** gráficos continuam protagonistas + camada que ensina a ler (não conclusão pronta).
2. **Escopo:** redesenho dos painéis fracos + correção de lógica + camada explicativa (~3 waves).
3. **Linguagem visual ("linha honesta"):** manter tipos de gráfico; enriquecer com eixos numerados, valor nos pontos, interpolação reta (sem spline), linhas de referência rotuladas, legenda de cor por time.
4. **Padrão explicativo (standard):** legenda curta persistente + `<InfoPopover>` ⓘ "como apostar" + tooltip rica (nome + métricas formatadas + leitura em 1 frase).
5. **Estrutura:** primitivos compartilhados primeiro → refactor dos painéis → correções de lógica.

## Arquitetura — primitivos compartilhados

Novo `components/fixtures/stats/_primitives/`:

- **`<ChartFrame>`** — eixo Y numerado (ticks do domínio), eixo X rotulado (`xLabels: string[]`), `referenceLines: {value,label,color}[]`, slot `children`, encapsula escape-hatch `width` fixo de teste (hoje duplicado em 4 painéis → 1).
- **`<TeamLegend>`** — fonte única de cor por time. `home`→`--color-vermelho`, `away`→`--color-depth`. Exporta `useTeamColor(side)`.
- **`<InfoPopover>`** — ⓘ no header; Radix Popover (já no projeto); markdown curto por painel; a11y (aria-label, ESC, focus trap).
- **`<RichTooltip>`** — `title`, `rows:{k,v}[]` (valores já formatados), `reading:string`. Adaptador recharts (`content=`) + lightweight-charts (crosshair subscribe).

Helpers puros:
- `lib/fixtures/stats/format.ts` — `fmt()` central: `0.4525… → "0.45"`, `1591 → "1.591"`, `0.73 → "73%"`.
- `lib/fixtures/stats/readings.ts` — gera frases de "leitura" por contexto (correlação/trend/outlier/par de scatter).

Nenhum primitivo toca lógica de dados — só apresentação.

## Mudanças painel a painel

**① Recent-matches (C+):** `<ChartFrame>` (Y numerado, valor por ponto, interpolação **reta**, X=adversários, média rotulada `média 1.8`), `<TeamLegend>`, tooltip por ponto (adversário, placar, V/E/D, valor).

**② Players scatter (G+):** `<ChartFrame>` + linhas de quadrante (mediana minutos × mediana eff/90) + cantos rotulados ("titular decisivo"); `<RichTooltip>` (`M. Salah · Liverpool / Minutos 2.480 / G+A·90 0.51 / leitura`); legenda curta fixa + `<InfoPopover>`; eixo rotulado; `eff/90` → "Decisivo /90min".

**③ Scatter playground (L):** badge `interpretR` ao lado do número (faixas <0.3 desprezível / 0.3–0.5 fraca / 0.5–0.7 moderada / >0.7 forte); chips de `SCATTER_PRESETS`; `<TeamLegend>` + `<InfoPopover>`; frase auto-gerada par+R.

**④ Predictions (J):** chip de % com cor por **força** (≥90% verde, 70–89% âmbar, <70% neutro); colunas de evidência com cabeçalho de time + bolinha de cor (`🔴 Aston Villa` / `🔵 Liverpool`); `<InfoPopover>` (predição é do jogo, bullets = evidência da forma de cada lado).

**⑤ Insights (N):** reescrita (ver Lógica); ícones crípticos → rótulos-palavra (`CORRELAÇÃO`/`TENDÊNCIA`/`PADRÃO`/`OUTLIER`) + cor por tipo; card = título natural + 1 linha "o que significa pra aposta".

**Ripple (mesmos primitivos):** Radar (K) `<TeamLegend>`+`<RichTooltip>`; Momentum (B) `<ChartFrame>`+`<TeamLegend>`; Distribuições (M) `<RichTooltip>`+`<InfoPopover>`.

**Não tocar (YAGNI):** team-record, h2h, splits, referee, streaks, markets — já comunicam bem, fora do sinalizado.

## Correções de lógica/dados

1. **Filtro tautologia** (`insights.ts`): `TAUTOLOGICAL_PAIRS` (cartões↔booking points, gols↔gols 1T+2T, etc.) bloqueados em `computeCorrelations`. Abre espaço no top-6 pra insights reais.
2. **Reescrita betting-language** (`readings.ts`): título natural + leitura acionável. Ex.: correlação `Quando finaliza mais, marca mais` + `Nos últimos 10, SOT e gols andam juntos (r=0.88). Finalizando bem → mercado de gols do time tende a bater.`. Trend e outlier análogos.
3. **Ranking ajustado** — dedup por kind mantido; tautologias fora.
4. **Scatter:** `SCATTER_PRESETS` (pares curados, label PT) + `interpretR(r)` em `derive.ts`.
5. **Recent-matches:** deriver expõe `referenceValue` (média) + `xLabels` (adversário abreviado, já em `recent_matches[].opponent`); zero suavização.

Sem mudança no scraper nem no shape de `detail_json`. Follow-up #5 (predictions/trends vazios) continua separado.

## Waves

**Wave 1 — Primitivos (solo, TDD strict):** `format.ts`+`readings.ts` (100% unit) + 4 componentes `_primitives/` + testes render. Sem visual ainda. Gate: lint/typecheck/test verde.

**Wave 2 — Lógica (paralelo, 2 worktrees):**
- T-A: insights engine (tautologia + readings + ranking) — `insights.ts`/`.test.ts`
- T-B: derive (presets + interpretR + referenceValue/xLabels) — `derive.ts`/`.test.ts`
- Disjuntos. SDD: spec review + code-quality review por task.

**Wave 3 — Refactor painéis (paralelo, 3 worktrees):**
- T-C: recent-matches + momentum
- T-D: players scatter + scatter-playground
- T-E: predictions + insights + radar + distribuições
- Consomem só primitivos/lógica estáveis das waves 1-2. Integração final pluga + suite cheia.

## Testes (pirâmide)

- **Unit:** format/readings/derive/insights (lógica pura).
- **Component:** por painel — legenda presente, tooltip com valor formatado (regressão: nunca float cru), axis labels, popover a11y (abre/fecha/ESC).
- **Integration:** `stats-page.test.tsx` — 14 slots ainda montam + novos elementos.
- **Regressão:** snapshot de números formatados (`0.45` nunca volta a `0.4525…`).
- **E2E:** `stats-page.spec.ts` — hover→tooltip, ⓘ→popover, axe-core 0 violations.

## Processo

Worktrees isoladas + SDD (implementer → spec review → code-quality review → merge) + revisão/merge autônomos. Sem `Co-Authored-By`. Branch por task, merge em main, deploy automático no push.

## Bundle

Primitivos leves, sem lib nova (Radix Popover já presente). Delta esperado ~+5KB gzip. Sem novo risco de budget.

## Riscos / trade-offs

- Wave 1 sem entregável visual isolado — aceito (fundação garante consistência, que é o objetivo declarado).
- Primitivo `<ChartFrame>` precisa abstrair recharts E lightweight-charts — risco de vazamento de abstração; mitigação: 2 adaptadores finos, não 1 genérico forçado.
- `readings.ts` é heurística textual — pode soar genérico; mitigação: frases parametrizadas por valor real (r, slope, magnitude do outlier), não templates fixos.
