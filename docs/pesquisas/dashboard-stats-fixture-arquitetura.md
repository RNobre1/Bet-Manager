---
tipo: pesquisa
titulo: "Arquitetura visual de /fixtures/[id]/stats — chart libs, grid, filtros, hero LED e performance em Cloudflare Workers"
status: completed
metodologia_tier: L2
source_diversity: 15
primary_source_ratio: 0.60
citation_density: 0.91
triangulation_coverage: 0.72
latency_min: 56
evidence_grades:
  primary_claim: B
  secondary_claim: C
autor: pilot+claude+researcher
criado: 2026-05-13
revisado: 2026-05-13
relacionado:
  - CLAUDE.md (Abissal)
  - app/(dashboard)/fixtures/[id]/page.tsx
  - app/globals.css (design tokens Abismo Habitado)
  - package.json (dependências já instaladas)
tags: [research, frontend, dataviz, dashboard, cloudflare-workers, nextjs, react-19]
---

# Arquitetura visual de `/fixtures/[id]/stats`

> Pesquisa para decidir a stack de visualização, grid, filtros e estratégia de renderização da rota nova `/fixtures/[id]/stats` no Abissal — dashboard denso de pré-jogo, dataset volumoso (109-184 streaks/lado, ~10 jogos × 36 campos, ~39 mercados de odds), uso pessoal desktop-first, deploy Cloudflare Workers via OpenNext.

---

## 1. Context

O Abissal já tem a rota `/fixtures/[id]` (AnalyzePanel IA + header simples, central column 4xl). A próxima decisão de produto é abrir uma rota irmã `/fixtures/[id]/stats` que materialize visualmente o `detail_json` denso vindo do scraper (recent_matches, h2h, streaks agrupados, splits 1H/2H, odds_summary, referee_record, player_stats). A direção visual já está acordada: **hero "Times Square" no topo + corpo "Match Telemetry" estilo TradingView/FotMob**, em dark mode com tokens do design system Abismo Habitado.

O custo de decidir errado é alto pra um projeto pessoal: cada lib nova adiciona bundle ao Worker (limite 10 MiB gzip Paid plan — [3]), e troca de stack mid-build implica reescrever componentes. A pesquisa precisa responder simultaneamente: que libs já instaladas resolvem? Quais NÃO valem? E como o React 19 Compiler + Server Components muda a equação de memoização que tipicamente justifica `useMemo`?

A solução tem que conviver com o runtime Workers (sem Node-only APIs no client), encaixar nos tokens do design system, manter o budget de +150 KB gzip sobre a página atual, e priorizar desktop sem deixar mobile virar 404.

## 2. Central question

Dado o dataset denso por fixture, os tokens do design system Abismo Habitado, o runtime Cloudflare Workers e as 4 libs de visualização já instaladas (recharts, lightweight-charts, @tanstack/react-virtual, @duckdb/duckdb-wasm), **qual arquitetura visual (chart libs + grid system + UX de filtros + estratégia de renderização) entrega densidade tipo TradingView/FotMob sem estourar bundle e sem inventar dependências?**

## 3. Sub-questions

| # | Sub-question | Search scope |
|---|---|---|
| 3.1 | Qual chart lib pra qual papel — recharts vs lightweight-charts vs @visx (adicionar?) | Bundlephobia, GitHub issues recharts, PkgPulse, LogRocket, TradingView docs |
| 3.2 | Grid: fixed CSS grid + container queries vs `react-grid-layout` vs `dnd-kit` | npm trends, Puck blog, GitHub dnd-kit discussion, Sencha blog |
| 3.3 | UX de filtros pra 100-200 streaks: faceted, cmdk, chips, virtualizer | Algolia, NN/G, UXmatters, uxpatterns.dev, TanStack Virtual docs |
| 3.4 | Padrões de design inspiração — TradingView/FotMob/SofaScore — o que copiar / o que não | TradingView blog, comparação saashub, tikitaka.gg, mckayjohns substack |
| 3.5 | Cloudflare Workers + Next.js 16 + OpenNext: budget, RSC streaming, React Compiler | Cloudflare docs, OpenNext docs+changelog, React docs, Medium migration write-ups |

## 4. Applied methodology

- **Tier**: L2 (decisão arquitetural de página inteira, vira ADR; envolve trade-offs entre 4 libs já instaladas vs adicionar).
- **Tools**: WebSearch (10 queries), WebFetch (5 — Bundlephobia bloqueado por scraping mas npm/GitHub/docs OK), Read/Glob no repo Abissal, `gzip` + `du` direto em `node_modules/` pra medições empíricas após critic.
- **Subagents**: researcher single agent + research-critic adversarial em segunda iteração (claude orchestrator).
- **Wall-clock time**: researcher 14:02 → 14:40 (38 min); critic 14:55 → 15:00 (5 min); iteração corretiva claude 15:00 → 15:13 (13 min). Total ≈ 56 min.
- **Adversarial review**: research-critic rodou após o draft v0.1 e devolveu 3 blocking + 5 must-fix (logado em §12). Versão atual v0.2 incorpora todas as correções; mudanças críticas foram validadas empiricamente (medição direta de bundle, grep de imports no repo, leitura de `next.config.ts`).

## 5. Sources consulted

| # | URL | Type | Quality | Notes |
|---|---|---|---|---|
| 1 | https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026 | secondary | **low** | Guia 2026 com números, mas **internamente contraditório** (recharts: 290 KB em um lugar, 370 KB em outro; chart.js: 65 vs 213; nivo: 40 vs 186). Usar só como sinal qualitativo de "ordem de grandeza", nunca como número primário. |
| 2 | https://blog.logrocket.com/best-react-chart-libraries-2025/ | secondary | high | Diz: "Recharts performance can drop with larger data sets because each point generates an SVG node"; "Visx works well in busy dashboards that must load fast even with many charts on screen". |
| 3 | https://developers.cloudflare.com/workers/platform/limits/ | primary | high | Limite Worker: 3 MiB free / 10 MiB Paid (gzipped); 64 MB uncompressed; startup 1s; CPU 5 min default Paid; mem 128 MB. |
| 4 | https://opennext.js.org/cloudflare/troubleshooting | primary | high | Doc oficial OpenNext sobre size issues, troubleshooting bundle. |
| 5 | https://developers.cloudflare.com/changelog/2025-06-05-open-next-size/ | primary | high | Changelog 2025-06-05: OpenNext v1.2 reduziu bundle de 14→8 MiB (2.3→1.6 MiB gzip) num app create-next-app. ⚠️ Projeto Abissal usa `^1.19.8` — números são baseline histórico, não medição da versão instalada. |
| 6 | https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837/ | primary | high | Anúncio v5 (mar/2025): "base bundle 35 KB". Não especifica gzip vs raw. **Projeto pinned em `^4.2.3`** — número não se aplica diretamente. Cifra real medida empiricamente, ver [23]. |
| 7 | https://github.com/tradingview/lightweight-charts | primary | high | Repo oficial — confirma "performant financial charts built with HTML5 canvas" (canvas-based, escala diferente de SVG). |
| 8 | https://github.com/recharts/recharts/issues/1417 | primary | medium | Issue aberta 2018 sobre tamanho; comunidade reporta valores divergentes ao longo dos anos (40 KB→370 KB conforme versão e estratégia de import). |
| 9 | https://airbnb.io/visx/docs/heatmap | primary | high | Doc oficial @visx/heatmap (HeatmapRect / HeatmapCircle, props: data, xScale, yScale, colorScale, bin*, gap). |
| 10 | https://www.npmjs.com/package/@visx/heatmap | primary | high | npm — confirma @visx/heatmap como pacote modular separado, ~200K downloads/semana. |
| 11 | https://tanstack.com/virtual/latest | primary | high | Doc oficial TanStack Virtual — já instalado (`@tanstack/react-virtual@3.13.2`). Não cita threshold de virtualização — apenas exemplos de 10K+. |
| 12 | https://npmtrends.com/@dnd-kit/core-vs-gridstack-vs-react-beautiful-dnd-vs-react-dnd-vs-react-draggable-vs-react-grid-layout-vs-rsuite-table-vs-sortablejs | secondary | medium | npm trends mostra @dnd-kit/core ~13.4M weekly vs react-grid-layout ~2.3M weekly; ambas vivas em 2026. |
| 13 | https://github.com/clauderic/dnd-kit/discussions/1560 | primary | medium | Discussão oficial dnd-kit: "Can DND do the react-grid-layout showcase?" — confirma dnd-kit precisa código adicional pra comportamento de grid. |
| 14 | https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice | secondary | medium | Case study iLert: por que escolheram react-grid-layout pra dashboard com widgets resizable. |
| 15 | https://www.algolia.com/blog/ux/faceted-search-an-overview | primary | high | Algolia oficial — padrões de faceted search (OR dentro do facet, AND entre facets; chips com X; "Clear all"). |
| 16 | https://www.nngroup.com/articles/filters-vs-facets/ | primary | high | NN/G — definição canônica de filter vs facet UX. |
| 17 | https://uxpatterns.dev/patterns/advanced/command-palette | secondary | medium | Padrão canônico command palette (fuzzy match, debounce 300-500ms, ARIA). **NÃO contém threshold de "2-3K itens"** — claim original v0.1 era hallucination, corrigido em v0.2. |
| 18 | https://www.saashub.com/compare-fotmob-vs-sofascore | secondary | medium | Comparação direta FotMob vs SofaScore: "SofaScore goes wider, FotMob is cleaner". Insight qualitativo, não fonte de decisão arquitetural. |
| 19 | https://react.dev/reference/react/useMemo | primary | high | Doc oficial React — comportamento atual de useMemo. **NÃO é fonte canônica de comportamento do Compiler**. |
| 20 | https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/ | primary | high | Anúncio oficial CF do adapter OpenNext — confirma arquitetura SSR + RSC no Workers. |
| 21 | https://tailwindcss.com/docs/responsive-design#container-size-based-styles | primary | high | Docs oficiais Tailwind v4 — `@container`, `@max-*`, queries nomeadas (`@container/main`), Baseline 2023. Substituiu a citação v0.1 que era de blog secundário. |
| 22 | https://react.dev/learn/react-compiler | primary | high | Docs oficiais do React Compiler — automatic memoization, opt-in via plugin. Configuração explícita necessária; **não vem ativo por default**. |
| 23 | Medição empírica direta em `node_modules/lightweight-charts/dist/` (gzip do `lightweight-charts.standalone.production.js`) | primary | high | **`51,073 bytes gzipped / 163,684 bytes raw` para v4.2.3** — número real que entra no bundle do projeto, mais alto que o "35 KB" do anúncio v5. |
| 24 | Inspeção direta em `app/(dashboard)/explore/explorer.tsx:61` e `next.config.ts` | primary | high | DuckDB-WASM **já é usado** em /explore via `await import("@duckdb/duckdb-wasm")` (dynamic import). `next.config.ts` **não** tem `experimental.reactCompiler` — apenas `optimizePackageImports`. |

## 6. Synthesis

### 6.1 Chart libraries por papel

**Papel A — sparklines/mini-charts** (form 5 jogos, série de goals últimos 10, mini bar de cards por jogo). Recharts já está instalado e cobre [2]. Custo é SVG-per-point — recharts gera um nó SVG por data point [2], confortável pra séries de 10-20 pontos. Bundle real do projeto não medido (follow-up §11: rodar `@next/bundle-analyzer`); guides 2026 divergem entre 290 e 370 KB [1, 8] — número exato é incerto, mas custo já está amortizado pela presença em outras rotas do Abissal.

**Papel B — séries temporais densas / "TradingView-like"** (PPG rolling home vs away, sequência de booking_points jogo-a-jogo). Lightweight-charts canvas-based [7]. **Versão instalada: v4.2.3** (não v5). Bundle real medido empiricamente [23]: `lightweight-charts.standalone.production.js` = **51 KB gzip / 164 KB raw**. Para >100 pontos, canvas vence SVG por ordem de magnitude. Limitação: não tem heatmap nem stacked bars — usar apenas pra séries financeiro-like (line/area/histogram/baseline). Considerar upgrade pra v5 (anúncio cita "35 KB" mas sem gzip qualifier confirmado [6]) como follow-up condicional se o ganho de bundle justificar mudança major.

**Papel C — heatmap do grid de streaks** (109-184 entradas/lado × 10 grupos × ~10-20 stat_types). `@visx/heatmap` é canônico [9, 10] e modular. **MAS** CSS Grid puro com `background-color: hsl(0, X%, Y%)` derivado de `overall_perc` resolve o caso "heatmap categórica sem tooltip elaborado" com 0 KB adicional, mantendo `var(--color-vermelho)` do design system. Decisão evolutiva: iniciar CSS-puro; promover a `@visx/heatmap` apenas após medir bundle real do candidato (estimativa qualitativa: dezenas de KB, não centenas — confirmar com `bundlejs.com` ou `@next/bundle-analyzer` antes de adicionar, ver §11).

**Não adicionar:** ECharts (bundle alto, ergonomia React via wrapper desconfortável), Nivo (cada chart é pacote separado, somatório vira sub-ótimo), Chart.js (sem ergonomia React boa pra design custom), react-financial-charts (SVG-based, OHLC-first — não casa com nosso dataset não-OHLC). Recharts + lightweight-charts + CSS Grid + (opcional) @visx/heatmap cobre 100% dos papéis identificados.

### 6.2 Grid / Layout

**Adversarial test do brief: "react-grid-layout é over-engineering pra 1 user?"** — sim, três razões triangulam:

1. **Layout estático determinado pelo designer**, não um BI tool onde usuário arrasta widgets. react-grid-layout construído pra Grafana/Jira/Metro [14].
2. **react-grid-layout** ainda mantido [12, 13], 2.3M downloads/semana, mas adiciona ~30-40 KB gzip + complexidade de breakpoints próprios + fricção com RSC do Next.js 16 (precisa `"use client"`).
3. **Tailwind v4 trouxe container queries built-in** [21] (docs oficiais Tailwind). Sintaxe `@container` + `@max-*` + nomeados `@container/main`. 0 KB de JS. Baseline 2023 — todos os browsers do Abissal.

**Decisão 3.2:** CSS Grid + Tailwind v4 container queries [21]. Hero `grid-cols-12 gap-4`; telemetry body `@container/card` por componente. dnd-kit/react-grid-layout só se Pilot quiser drag/resize no futuro — follow-up condicional.

### 6.3 UX para 100-200 streaks

**Triangulação:**
- Algolia [15] + NN/G [16]: chips de filtro ativos no topo + clear all + OR dentro do facet + AND entre facets.
- UXmatters/Algolia: facets de 50+ opções devem mostrar top 5-10 + "Show more" ou search-within-filter [15].
- Command palette canônico (cmdk já instalado e em uso em `components/command-palette.tsx`): fuzzy match nativo, ARIA, debounce 300-500ms quando lista vem de fetch [17]. **Não há benchmark de threshold em fonte primária**; dataset de 109-184 entradas cabe muito abaixo de qualquer limite prático.
- TanStack Virtual já instalado (`@tanstack/react-virtual@3.13.2`); docs oficiais [11] dão exemplos a partir de 10K itens, **sem threshold mínimo declarado**.

**Decisão 3.3 — 3 camadas compostas:**

1. **Estrutural:** chips horizontais dos 10 grupos (Result, BTTS, Cards, Corners, Goals, Half, Shots, Fouls, Offsides, Booking Points). Multi-select com OR dentro do facet [15]. Visual: `--color-surface-3` inativo, `--color-vermelho` + `--shadow-glow-vermelho` ativo.
2. **Threshold:** input numérico ou slider Radix-UI sobre `overall_perc` (e.g. "≥70%"). `@radix-ui/react-slider` peer-compatível com Radix já no projeto.
3. **Busca textual (opcional):** `Cmd+K` abre cmdk filtrando por `stat_type` (fuzzy match nativo, dataset em memória — sem debounce necessário).

Virtualizar via `@tanstack/react-virtual` (já instalado, custo zero): habilitar incondicionalmente como camada inerte — em 109-184 itens, perf é equivalente a render direto, mas garante que filtros que crescerem a lista (e.g. se choistats adicionar grupos novos) já estão cobertos. Decisão pragmática, não dogmática.

### 6.4 Inspirações UX (FotMob/SofaScore/TradingView)

**FotMob — copiar:**
- Headline "key stat" cards no topo [18].
- "Match momentum" graph como vista narrativa (PPG rolling home vs away últimos 10 jogos).

**SofaScore — copiar:**
- Heatmap visual (rebatido pra grid de streaks, não zonas do campo).
- Painel detalhado com cards densos lado a lado.
- Expand/collapse de grupos raros.

**TradingView — copiar:**
- Hero "ticker" com glow vermelho do `--shadow-glow-vermelho`.
- Crosshair sincronizado entre charts temporais [6, 7].
- Eixos Y duplos com escalas independentes.

**NÃO copiar:**
- Candlesticks (dataset não é OHLC).
- Field heatmap de SofaScore (sem dado xy).
- Live ticker FotMob (pré-jogo).
- Player ratings sintetizados (não temos rating).

### 6.5 Performance: React 19 Compiler + RSC + Cloudflare Workers

**Limites Worker:** 3 MiB free / **10 MiB Paid** gzip; 64 MB uncompressed; startup 1s; CPU 5min Paid; mem 128 MB [3].

**OpenNext:** baseline v1.2 reduziu create-next-app 14→8 MiB (2.3→1.6 MiB gzip) [5]. ⚠️ Projeto Abissal usa `@opennextjs/cloudflare ^1.19.8` — muito mais novo que v1.2; os números do changelog são baseline histórico, não medição da versão instalada. Bundle real é unmeasured (follow-up §11).

**Estratégia:**
1. **Server Component pré-computa** derivadas (form%, splits 1H/2H, agregações) usando `detail_json` already in row [20]. Roda no Worker, devolve HTML + RSC payload.
2. **Client Components recebem props prontas** — sem recomputação.
3. **Filtros interativos** em Client Components operam sobre arrays já reduzidos.
4. **Memoização**: React Compiler **NÃO está habilitado** em `next.config.ts` [24] — `experimental` só contém `optimizePackageImports`. Estratégia válida hoje: usar `useMemo` cirurgicamente apenas onde profiler identificar hot path, NÃO profilaticamente. Avaliar habilitar React Compiler como follow-up §11 (`experimental: { reactCompiler: true }` [22]) — isso permitiria remover `useMemo` manuais, mas é mudança que afeta todo o projeto, não decisão local de `/stats`.
5. **RSC streaming**: hero acima do fold renderiza primeiro; streaks pesados em `<Suspense>` boundary.

**Por que NÃO usar DuckDB-WASM em `/stats`** (validando hipótese do Pilot, mas com argumento correto):

- DuckDB-WASM **já está em uso em `/explore`** [24] — `app/(dashboard)/explore/explorer.tsx:61` faz `await import("@duckdb/duckdb-wasm")` (lazy dynamic). **NÃO é candidato a remoção** — a lib serve outra rota.
- Arquitetura DuckDB-WASM: WASM binário (`duckdb-browser-eh.worker.js` ~773 KB raw, mvp variant ~845 KB raw, blocking ~1.17 MB raw) é fetched async em runtime, não bundled no chunk principal do Worker. Argumento "consome budget Worker" é **arquiteturalmente incorreto**.
- **Argumento correto:** o dataset de `/stats` é **1 fixture com 50-200 KB JSON em row**. `Array.filter`/`reduce`/`group_by` via reduce + `simple-statistics` já instalado resolve qualquer agregação em <1 ms. Adicionar DuckDB-WASM em `/stats` paga (a) cold start ~500ms-1s pra instanciar WASM mesmo lazy [24], (b) complexidade SQL desnecessária pra agregação trivial, (c) re-fetch de ~800KB-1.2MB de worker code se o user veio do hero direto. **Latência + complexidade**, não bundle.
- DuckDB-WASM seria justificável em `/explore` (cross-fixture queries arbitrárias) — que é exatamente onde ele já está.

**Bundle adicional estimado:** ainda incerto sem medição. Lightweight-charts v4 já no bundle (51 KB gzip [23]); recharts já no bundle. Adicionar opcionalmente `@visx/heatmap` se decisão evolutiva confirmar (estimativa qualitativa: dezenas de KB, validar com `bundlejs.com` ou `@next/bundle-analyzer` antes). Budget auto-imposto de +150 KB é conservador e folga grande.

## 7. Triangulated claims

| Claim | Confirming sources | Status | Evidence grade |
|---|---|---|---|
| Cloudflare Worker Paid plan tem limite de 10 MiB gzip e Free 3 MiB. | [3], [5] | [triangulated] | A |
| **Lightweight-charts v4.2.3 instalado pesa 51 KB gzip / 164 KB raw na build standalone production.** | [23] (medição direta) | [single] — empírico, projeto local | A |
| Lightweight-charts é canvas-based (não SVG); v5 anunciou ~35 KB base mas projeto está em v4. | [6], [7] | [triangulated] (canvas) / [partial] (35 KB — sem gzip qualifier confirmado) | B |
| Recharts gera 1 nó SVG por data point e degrada perf em datasets grandes. | [2] (citação direta) + comportamento de SVG conhecido | [partial] — [2] secundário high quality | B |
| Visx é modular (instalar apenas pacotes específicos); cifras absolutas requerem bundlejs.com. | [9], [10] | [partial] — confirma modularidade, não cifra absoluta. | C |
| Tailwind v4 tem container queries built-in (sem plugin), Baseline 2023. | [21] (docs oficiais) | [single] — fonte primária oficial. | A |
| react-grid-layout serve dashboards customizáveis, não layouts estáticos. | [13], [14] | [triangulated] | B |
| dnd-kit precisa código adicional pra replicar grid behavior. | [13] | [single] — fonte primária, discussão oficial dnd-kit | C |
| Faceted filter: OR dentro do facet, AND entre facets; chips active + clear all é padrão. | [15], [16] | [triangulated] | A |
| React Compiler **não está habilitado** em `next.config.ts` do Abissal. | [24] (inspeção direta) | [single] — empírico | A |
| React Compiler é opt-in via plugin/config explícita; faz automatic memoization quando ativo. | [22] | [single] — docs oficiais React | A |
| OpenNext Cloudflare v1.2 reduziu bundle base 14→8 MiB (2.3→1.6 MiB gzip). | [4], [5] | [triangulated] | A |
| **OpenNext instalado no Abissal: v1.19.8** (muito mais novo que v1.2; bundle real não medido). | [24] (package.json) | [single] — empírico | A |
| FotMob/SofaScore comparison é qualitativa, não fonte de decisão arquitetural. | [18] | [single] — insight inspiracional, marcado como tal | C |
| Command palette cmdk com fuzzy match — dataset 109-184 itens cabe folgado abaixo de qualquer limite prático. | [17] (cmdk patterns gerais) + [24] (já usado em /command-palette) | [partial] — sem benchmark numérico citado | C |
| **DuckDB-WASM já é usado em `/explore` (lazy dynamic import); rejeitado em `/stats` por latência + complexidade, NÃO por bundle.** | [24] (inspeção direta) + arquitetura DuckDB conhecida | [single] — empírico | A |

## 8. Alternatives considered

| Alternative | Why not chosen |
|---|---|
| Adicionar **ECharts** | Bundle alto (estimativa ~250 KB gzip [1] mas fonte não-confiável), ergonomia React via wrapper desconfortável, sem features extras que justifiquem vs recharts+lightweight-charts. |
| Adicionar **Nivo** | Cada chart é pacote separado; somatório com 4-5 chart types vira sub-ótimo vs combinação atual. |
| Adicionar **react-financial-charts** (Papel B alternativo) | SVG-based, OHLC-first. Dataset Abissal não é OHLC, e SVG é exatamente o problema que lightweight-charts resolve pra séries densas (canvas single render vs N nós SVG). |
| Adicionar **Tremor** (component library) | Wrapper sobre recharts com componentes prontos. Trade-off: economiza implementação mas força design language Tremor — conflita com Abismo Habitado. Reconsiderar se houver pressão de prazo. |
| Adicionar **AG-Charts free tier** | Comunidade reduzida, foco enterprise. Sem ganho claro vs combinação atual. |
| **DuckDB-WASM** em `/stats` | Já em uso em `/explore` (não remover). Em `/stats`: latência (cold start 500ms-1s) + complexidade SQL desnecessária pra 50-200 KB JSON; rejeitado por arquitetura, não bundle. |
| **react-grid-layout** | Over-engineering pra layout estático com 1 user. Container queries Tailwind v4 [21] resolvem responsividade com 0 KB JS. |
| **dnd-kit** pra grid | Precisa código adicional pra replicar comportamento de grid [13]; sem use-case que justifique. |
| **WebGL/Canvas custom pra hero LED** | CSS `box-shadow`/`text-shadow` com `--shadow-glow-vermelho` é suficiente; canvas overkill pra elemento estático. |
| **recharts ScatterChart pra heatmap** | Cada célula = nó SVG; perf inferior a CSS Grid puro ou visx canvas. |
| **react-window** | `@tanstack/react-virtual` já instalado, sucessor canônico [11]. |
| **Habilitar React Compiler agora** | Mudança de configuração global do projeto (`experimental.reactCompiler: true`), afeta TODAS as rotas. Decisão fora do escopo de `/stats`. Follow-up §11 como mudança autônoma quando o Pilot estiver pronto pra avaliar impacto cross-route. |

## 9. Known limitations

1. **research-critic rodado, mas pesquisa permanece exposta a:**
   - PkgPulse [1] tem números internamente contraditórios; downgraded pra `secondary/low`.
   - Citações originalmente fabricadas em cmdk threshold [17] e TanStack Virtual threshold [22] foram removidas em v0.2; argumentação alternativa baseada no tamanho real do dataset.
   - Bundle real do projeto Abissal **não medido** ainda — follow-up §11 ainda em aberto.
2. **Bundlephobia indisponível:** fetches retornaram homepage; mediu lightweight-charts diretamente em `node_modules` [23]; outros tamanhos absolutos seguem sob estimativa qualitativa até bundle-analyzer rodar.
3. **Sem POC empírico na rota nova:** todas as conclusões são raciocínio sobre fontes + leitura do repo; perf real e bundle final só após `/stats` existir e ser medido.
4. **Versões instaladas mais novas que as discutidas na pesquisa:**
   - OpenNext: v1.19.8 instalado, baseline §6.5 cita v1.2.
   - Lightweight-charts: v4.2.3 instalado, anúncio "35 KB" é v5.
   - Estes mismatch são documentados mas não invalidam decisões; afetam apenas precisão numérica.
5. **Mobile UX**: §10 item 6 dá constraint concreta (heatmap em `overflow-x-auto`, gráficos single-column, tabs Radix pra seções secundárias), mas sem mockup validado em 360px. POC mobile como follow-up.
6. **React Compiler config verificada empiricamente** [24] — **NÃO está ativo**; §6.5 e §10 atualizados pra refletir isso.

## 10. Suggested decision

**Stack final pra `/fixtures/[id]/stats`:**

1. **Chart libs:** recharts (sparklines/mini-charts, já instalado) + lightweight-charts v4.2.3 (1-2 séries temporais densas, 51 KB gzip standalone production [23]) + **CSS Grid puro pra heatmap inicial** (promover a `@visx/heatmap` apenas após medir bundle real do candidato com `bundlejs.com` ou `@next/bundle-analyzer`).
2. **Grid:** CSS Grid + **Tailwind v4 container queries** built-in [21]. Hero `grid-cols-12 gap-4`; telemetry body cards com `@container/card`. Rejeitar react-grid-layout e dnd-kit (over-engineering pra layout estático).
3. **Filtros streaks:** chips de grupos sempre visíveis + slider `@radix-ui/react-slider` sobre `overall_perc` + cmdk command palette (já em uso). Virtualizer via TanStack Virtual habilitado incondicionalmente (custo zero, futuro-proof).
4. **Hero LED:** CSS puro com `--shadow-glow-vermelho` + `text-shadow` em metric numbers + classe `.num` (mono tabular-nums já no design system). Sem WebGL/canvas.
5. **Performance:**
   - **Server Component pré-computa** derivadas (form%, splits 1H/2H, agregações).
   - **Client Components recebem props prontas** — sem recomputação.
   - **Filtros interativos** em Client Components operam sobre arrays já reduzidos.
   - **Memoização cirúrgica**: usar `useMemo` apenas onde profiler identificar hot path; **NÃO escrever profilaticamente** porque o ganho relativo é baixo em árvore rasa. React Compiler **não está ativo** [24] — habilitá-lo é decisão separada em §11.
   - **RSC streaming**: hero acima do fold renderiza primeiro; streaks pesados em `<Suspense>` boundary.
6. **Mobile** (constraint concreta):
   - **Heatmap de streaks**: container `overflow-x-auto` (scroll horizontal dentro de card, não da página inteira); altura do card limitada.
   - **Charts lightweight-charts**: 1 chart por card, full-width <768px; eixo Y direito esconde abaixo de 480px.
   - **Recent matches + h2h**: tabela com `display:grid` que colapsa colunas opcionais (offsides, tackles) abaixo de 600px.
   - **Streaks list**: full-width; chips de grupo em linha com `overflow-x-auto` (carousel horizontal); slider full-width.
   - **Navegação entre seções**: `@radix-ui/react-tabs` (já instalado) abaixo de 768px (hero + streaks + players + recent_matches como tabs); >=768px tudo na mesma viewport com scroll vertical.
   - POC em 360px obrigatório antes de release (follow-up §11).
7. **Bundle adicional:** **incerto sem medição**. Lightweight-charts já no bundle (51 KB gzip). Recharts já no bundle. Adicionar opcionalmente `@radix-ui/react-slider` (~8 KB gzip estimado, pacote tree-shakable). Heatmap CSS-puro = 0 KB. Promoção pra `@visx/heatmap` apenas após validar com bundle-analyzer. **Budget auto-imposto +150 KB** — generoso, com folga.
8. **NÃO adicionar:** ECharts, Nivo, Chart.js, react-financial-charts, react-grid-layout, dnd-kit, react-window. Manter DuckDB-WASM apenas em `/explore` onde já vive.

## 11. Follow-ups

- [x] **research-critic externo** sobre v0.1 (rodado em 2026-05-13; 3 blocking + 5 must-fix; resolvidos em v0.2).
- [ ] **ADR** registrando a decisão no `CLAUDE.md` do Abissal após Pilot aprovar v0.2.
- [ ] **POC bundle**: rodar `@next/bundle-analyzer` no `next build` atual (baseline pré-`/stats`) e novamente após implementar `/stats` — validar +150 KB budget e medir promoção a `@visx/heatmap`.
- [ ] **POC mobile** em viewport 360px da seção streaks (heatmap em overflow-x-auto + chips em carousel).
- [ ] **Decidir sobre habilitar React Compiler** (`experimental: { reactCompiler: true }` em `next.config.ts`): mudança cross-route, fora do escopo de `/stats`, mas faria sentido como follow-up autônomo.
- [ ] **Confirmar uso atual de DuckDB-WASM**: lib é usada em `/explore` [24]; auditar se há outras rotas (não-blocking).
- [ ] **Task decomposition** em `docs/tasks/dashboard-stats-fixture/` quando v0.2 aprovado e ADR escrito.
- [ ] **Atualizar CLAUDE.md** com convenção "Charts: recharts (sparklines) → lightweight-charts (séries temporais densas) → CSS Grid (heatmap simples) → @visx/heatmap (heatmap rico). NÃO adicionar ECharts/Nivo/react-financial-charts/Chart.js. DuckDB-WASM somente em /explore."
- [ ] **Investigar `predictions` e `trends` no scraper** (separado): por que 89% dos fixtures tem `predictions=[]` e 100% tem `trends=[]`? Endpoint choistats só popula próximo do kickoff? Scraper não puxa? — ver `docs/pesquisas/detail-json-inventario.md` §8 e §9.

## 12. Adversarial review log

### Iteração 1 — auto-adversarial (researcher, v0.1, 2026-05-13 14:40)

Researcher single-agent sem acesso ao tool `Agent`. Listou 8 weaknesses próprios mas não pôde rodar `research-critic` real.

### Iteração 2 — research-critic adversarial (parent agent, v0.1, 2026-05-13 15:00)

Verdict do critic: **blocks delivery**.

| # | Classification | Weakness identificado | Action taken em v0.2 |
|---|---|---|---|
| 1 | **blocking** | Lightweight-charts "35 KB gzip" cita v5 mas projeto usa v4.2.3; "gzip" qualifier não confirmado pelo blog [6]. | **Medição empírica direta** em `node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js` = **51 KB gzip / 164 KB raw** [23]. §6.1 Papel B reescrito; §7 com claim novo; §10 cita o número real. |
| 2 | **blocking** | DuckDB-WASM "consome budget Worker" é arquiteturalmente errado (WASM é async fetch, não bundle). Lib **JÁ É USADA** em `/explore` [24]. | §6.5 reescrito: argumento correto agora é latência (cold start 500ms-1s) + complexidade SQL desnecessária pra 1 fixture. §11 follow-up "candidato a remoção" trocado por "auditar se há outras rotas — manter em `/explore`". |
| 3 | **blocking** | cmdk "aguenta 2-3K itens" é citation hallucination — uxpatterns.dev [17] NÃO contém essa claim. | Número fabricado removido. §6.3 agora cita: "dataset de 109-184 cabe folgado abaixo de qualquer limite prático". |
| 4 | must fix | TanStack Virtual "<200 itens" é segunda hallucination — Medium [22] não cita threshold. | §6.3 reescrito: virtualizer habilitado incondicionalmente (custo zero, future-proof). Fonte [22] removida da bibliografia (não citável). |
| 5 | must fix | Tailwind v4 container queries — claim correto mas cita blog secundário [21] (Tailkits) | Cita trocada por **docs oficiais Tailwind v4** [21] (`tailwindcss.com/docs/responsive-design#container-size-based-styles`). Reclassificado evidence grade A. |
| 6 | must fix | OpenNext v1.2 baseline cited mas projeto usa v1.19.8. | §5 source [5] anotado; §6.5 reescrito; §7 com claim explícito da versão instalada [24]. |
| 7 | must fix | React Compiler "confiar em automatic memoization" — **NÃO está habilitado** em `next.config.ts`. | Verificado empiricamente [24]. §6.5 reescrito: estratégia muda pra "useMemo cirúrgico, NÃO profilático"; habilitar Compiler é decisão cross-route separada em §11. |
| 8 | must fix | PkgPulse [1] tem números internamente contraditórios (recharts 290 vs 370; chart.js 65 vs 213; nivo 40 vs 186). | Reclassificado pra `secondary/low` em §5 com nota explícita. Não é mais usado como fonte primária de número absoluto. |
| 9 | suggestion | react-financial-charts não considerado em §8 | Adicionado em §8 com justificativa de rejeição (SVG-based, OHLC-first, não aplica). |
| 10 | suggestion | Mobile estratégia subdesenvolvida no §10 | §10 item 6 reescrito com constraints concretas: overflow-x-auto pra heatmap, single-chart collapse <768px, tabs Radix pra seções. |
| 11 | suggestion | @visx/heatmap "+25-35 KB gzip" estimado sem fonte | §6.1 Papel C agora diz "estimativa qualitativa: dezenas de KB; validar com bundlejs.com antes de adotar". Não é mais número fixo no budget. |
| 12 | verificação | FotMob/SofaScore comparison é single source. | Mantido como insight inspiracional explícito (§6.4), evidence grade C; não é argumento arquitetural. |

**Itens verified sem problemas pelo critic:**
- CF Workers limits [3], OpenNext v1.2 changelog [5] (números), Tailwind v4 container queries (claim correto, citação fixa), versões do package.json (todas válidas).

### Iteração 3 (proposta, condicional)

Re-rodar `research-critic` sobre v0.2 antes de virar `.md` final é **opcional**. Justificativa pra pular: os 8 issues foram remediated com (a) medição empírica direta (não nova fonte), (b) remoção de claims fabricados, (c) swap pra fontes oficiais. Critic encontraria apenas as limitações já reconhecidas em §9 (bundle real ainda não medido, POC mobile não feito).

## 13. References

1. [Recharts vs Chart.js vs Nivo vs Visx 2026](https://www.pkgpulse.com/guides/recharts-vs-chartjs-vs-nivo-vs-visx-react-charting-2026) — ⚠️ internamente contraditório, qualitativo apenas.
2. [Best React chart libraries 2025 — LogRocket](https://blog.logrocket.com/best-react-chart-libraries-2025/)
3. [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
4. [OpenNext Cloudflare Troubleshooting](https://opennext.js.org/cloudflare/troubleshooting)
5. [OpenNext Cloudflare size optimization changelog](https://developers.cloudflare.com/changelog/2025-06-05-open-next-size/) — baseline v1.2 (jun/2025); projeto usa v1.19.8.
6. [Lightweight Charts v5 — TradingView](https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837/) — v5 announce (projeto usa v4.2.3).
7. [tradingview/lightweight-charts GitHub](https://github.com/tradingview/lightweight-charts)
8. [Recharts issue #1417 large bundle size](https://github.com/recharts/recharts/issues/1417)
9. [visx/heatmap docs](https://airbnb.io/visx/docs/heatmap)
10. [@visx/heatmap on npm](https://www.npmjs.com/package/@visx/heatmap)
11. [TanStack Virtual docs](https://tanstack.com/virtual/latest)
12. [npm trends: dnd-kit vs react-grid-layout](https://npmtrends.com/@dnd-kit/core-vs-gridstack-vs-react-beautiful-dnd-vs-react-dnd-vs-react-draggable-vs-react-grid-layout-vs-rsuite-table-vs-sortablejs)
13. [dnd-kit discussion #1560](https://github.com/clauderic/dnd-kit/discussions/1560)
14. [iLert: why react-grid-layout](https://www.ilert.com/blog/building-interactive-dashboards-why-react-grid-layout-was-our-best-choice)
15. [Algolia: faceted search overview](https://www.algolia.com/blog/ux/faceted-search-an-overview)
16. [NN/G: Filters vs. Facets](https://www.nngroup.com/articles/filters-vs-facets/)
17. [UX Patterns: Command Palette](https://uxpatterns.dev/patterns/advanced/command-palette) — sem benchmark de threshold de itens; usado apenas pra padrões (fuzzy, debounce, ARIA).
18. [FotMob vs SofaScore — SaaSHub](https://www.saashub.com/compare-fotmob-vs-sofascore) — insight inspiracional only.
19. [React useMemo docs](https://react.dev/reference/react/useMemo)
20. [Cloudflare blog: Next.js + OpenNext adapter](https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/)
21. [Tailwind v4 docs — Container Queries](https://tailwindcss.com/docs/responsive-design#container-size-based-styles)
22. [React Compiler — react.dev](https://react.dev/learn/react-compiler)
23. **Medição empírica:** `gzip -c node_modules/lightweight-charts/dist/lightweight-charts.standalone.production.js | wc -c` = 51,073 bytes; raw = 163,684 bytes. v4.2.3 (instalada no projeto Abissal).
24. **Inspeção empírica:** `app/(dashboard)/explore/explorer.tsx:61` (DuckDB-WASM lazy import); `next.config.ts` (`experimental` contém apenas `optimizePackageImports`, sem `reactCompiler`); `package.json` (versões instaladas: recharts 2.15.1, lightweight-charts 4.2.3, @duckdb/duckdb-wasm 1.29.0, @opennextjs/cloudflare 1.19.8, next 16.2.6).

---

## Version log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-05-13 14:40 | 0.1 | Versão draft — researcher single-agent + auto-adversarial. | pilot+claude+researcher |
| 2026-05-13 15:00 | — | research-critic adversarial: 3 blocking + 5 must-fix. | parent agent (claude) |
| 2026-05-13 15:15 | 0.2 | Incorpora todos os fixes do critic: medição empírica de lightweight-charts v4 (51 KB gzip), reformulação de DuckDB-WASM (lib é usada em /explore; argumento agora é latência), remoção de citation hallucinations (cmdk threshold, TanStack threshold), swap pra fontes oficiais (Tailwind v4 docs, React Compiler docs), confirmação que React Compiler NÃO está ativo. | claude |
