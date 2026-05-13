---
tipo: data-dictionary
titulo: "Inventário do detail_json — schema completo do payload de fixtures.detail_json"
status: live
fonte_amostra: 80 fixtures scrapeadas até 2026-05-13 (Premier, La Liga, Bundesliga, Serie A, Brasileirão A/B/C, Libertadores, Sudamericana, Eredivisie, Liga MX, Ecuador, Romania, Belgium, Sweden, etc.)
autor: pilot+claude
criado: 2026-05-13
revisado: 2026-05-13
relacionado:
  - lib/fixtures/prompt-builder.ts
  - lib/fixtures/badges.ts
  - lib/fixtures/repository.ts
  - app/(dashboard)/fixtures/[id]/stats (pendente)
tags: [data-dictionary, fixtures, detail_json, reference]
---

# `detail_json` — inventário completo

> Documento vivo de referência. **Consultar SEMPRE antes de adicionar painel ou visualização nova** em `/fixtures/[id]/*`. Mostra o que sempre temos, o que falta em algumas ligas, e o que ainda não vem populado.
>
> Atualizar este arquivo quando: (a) o scraper passar a popular um campo antes vazio, (b) o choistats mudar formato, (c) uma nova consulta ao DB revelar campos extras.

---

## Top-level — 9 chaves

Cada fixture tem exatamente estas 9 seções no campo `fixtures.detail_json` (jsonb):

| Chave | Tipo | Presença | Linhas que usa hoje |
|---|---|---|---|
| `team_record` | object | **100%** | `prompt-builder.ts:formatTeamRecord` |
| `recent_matches` | object | **100%** | `prompt-builder.ts:formatRecentMatches` |
| `h2h` | array | **100%** | `prompt-builder.ts:formatH2h` |
| `streaks` | object | **100%** | `prompt-builder.ts:formatStreaks`, `badges.ts:computeBadges` |
| `referee_record` | object \| null | **~4%** (só EPL no sample de 80) | `prompt-builder.ts:formatRefereeRecord`, `badges.ts:refereeIsHighCards` |
| `odds_summary` | object | **~56%** (45/80) — varia 0 a 39 mercados | `prompt-builder.ts:formatOddsSummary` |
| `player_stats` | object | **100%** | **NÃO usado pelo prompt** ainda (ouro escondido) |
| `predictions` | array | **~11%** (9/80) — Tier 2/3 LatAm + Romania | `prompt-builder.ts:formatPredictions` |
| `trends` | array | **0%** (vazio em 80/80) | nenhum |

**Streaks por lado:** entre **109 e 194 entradas** (avg 119, var 4 ligas). Por isso filtros são obrigatórios na UI.

---

## 1. `team_record` — record do time na temporada

**Forma:**

```ts
{
  home: { home: TeamSplit, overall: TeamSplit }   // o time da casa, com splits
  away: { away: TeamSplit, overall: TeamSplit }   // o time visitante, com splits
}
```

⚠️ **Nomenclatura assimétrica** — `team_record.home` contém splits `home + overall`; `team_record.away` contém splits `away + overall`. Sempre acessar via `team_record[side][side]` ou `team_record[side].overall`.

**`TeamSplit` (12 campos, tipos primitivos):**

| Campo | Tipo | Significado | Exemplo |
|---|---|---|---|
| `type` | string | `"Home"` \| `"Away"` \| `"All"` | `"Home"` |
| `played` | number | jogos disputados nesse split | 18 |
| `won` | number | vitórias | 6 |
| `draw` | number | empates | 5 |
| `lost` | number | derrotas | 7 |
| `goals_for` | number | gols pró | 24 |
| `goals_against` | number | gols contra | 24 |
| `goal_diff` | number | saldo | 0 |
| `points` | number | pontos | 23 |
| `points_per_game` | number | PPG (1 casa decimal) | 1.3 |
| `position` | string | ordinal inglês (`"14th"`, `"9th"`) — **PARSE NEEDED pra ordenar** | `"14th"` |
| `form` | array de string | últimos 5 resultados (W/D/L) — **ordem oldest → newest** | `["D","L","L","L","L"]` |

**Padrão para a UI `/stats`:**
- "Ficha do time" card: pontos, PPG, posição (parse ordinal), goal_diff, jogos (`played`).
- Form chips W/D/L com cores (`--color-success` / `--color-ink-muted` / `--color-vermelho`). **Reverter array** para mostrar newest-first ([[learning-form-order]] em adam-stats CLAUDE.md§lessons-learned).
- Comparativo home-split × overall pra ver se o time joga melhor em casa.

---

## 2. `recent_matches` — últimos 10 jogos por lado

**Forma:**

```ts
{
  home: RecentMatch[]   // 10 jogos do mandante (na liga ou competição)
  away: RecentMatch[]   // 10 jogos do visitante
}
```

⚠️ **Ordem newest → oldest** (oposta a `team_record.form`). Documentado em adam-stats§lessons-learned#10.

**`RecentMatch` (37 campos):**

```ts
{
  id: number;             // id do jogo no choistats
  date: number;           // unix ms
  date_iso: string;       // "2026-05-04"
  status: string;         // sempre "FT" no sample
  league: string;         // "Premier League"
  home_team: string;
  away_team: string;
  result: "W"|"L"|"D"|null;   // do ponto de vista do time-alvo (lado do bucket)
  htResult: "W"|"L"|"D"|null;

  // gols
  homeGoalsFt: number;  awayGoalsFt: number;
  homeGoalsHt: number;  awayGoalsHt: number;

  // cartões
  homeYellows: number;       awayYellows: number;
  homeReds: number;          awayReds: number;
  homeYellowReds: number;    awayYellowReds: number;
  homeBookingPoints: number; awayBookingPoints: number;   // 10 yellow / 25 red

  // chutes
  homeTotalShots: number;     awayTotalShots: number;
  homeShotsOnTarget: number;  awayShotsOnTarget: number;

  // corners (com splits 1H/2H — ouro pra "como esse time joga no 1T")
  homeCorners: number;     awayCorners: number;
  homeCorners1h: number;   awayCorners1h: number;
  homeCorners2h: number;   awayCorners2h: number;

  // outros
  homeFouls: number;     awayFouls: number;
  homeOffsides: number;  awayOffsides: number;
  homeTackles: number;   awayTackles: number;
}
```

**Padrão para a UI:**
- Tabela densa por jogo: `data_iso` · oponent · WDL · placar (HT/FT) · 1H/2H corners · cartões · BP.
- **Sparkline por estatística** (goals_ft sequence, corners total, booking_points) — recharts `LineChart` mini.
- **Toggle "ver só home/away"** (filtra os jogos em que o time-alvo foi mandante).
- **Comparativo 1H vs 2H**: bar duplo (corners1h x corners2h, goals_ht x (goals_ft - goals_ht)).

---

## 3. `h2h` — confrontos diretos

**Forma:** array de até 10 entradas, mesma `RecentMatch` shape (37 campos). Ordem newest → oldest.

⚠️ `result`/`htResult` aqui podem vir `null` (campo do dataset bruto, sem nossa interpretação de "lado do alvo"). Pra ranquear "quem ganhou", derivar de `homeGoalsFt vs awayGoalsFt`.

**Padrão para a UI:**
- Lista compacta com resultado + placar + data.
- Headline com agregado: "Últimos 10 H2H: X-Y-Z mandante / Z gols somados".
- Heatmap mini de 10 colunas × 4 linhas (gols, BP, corners, cartões) com cor por intensidade.

---

## 4. `streaks` — sequências de comportamento (CORE DATASET)

**Forma:**

```ts
{
  home: Streak[]   // 109-194 entradas
  away: Streak[]   // 109-194 entradas
}
```

**`Streak` (17 campos):**

```ts
{
  desc: string;        // descrição humana: "Unbeaten", "BTTS Win", "Over 2.5"
  group: StreakGroup;  // ver tabela abaixo
  stat_type: string;   // identificador estável: "OVER2_5", "CardsOver4_5", "BTTS_FirstHalf"
  line: number;        // linha numérica do mercado (0.0 quando não-aplicável)
  colour: "positive" | "negative" | "neutral";  // intenção visual

  // overall (combinado home + away últimos N jogos)
  overall_count: number;       // jogos que satisfizeram
  overall_fixtures: number;    // jogos no denominador
  overall_perc: number;        // 0..100
  overall_streak: number;      // atual streak vivo (run consecutiva)

  // splits home/away
  home_count: number;     home_fixtures: number;
  home_perc: number;      home_streak: number;
  away_count: number;     away_fixtures: number;
  away_perc: number;      away_streak: number;
}
```

**10 grupos (`streak.group`):**

| Group | Quantidade típica | Stat_types exemplo |
|---|---|---|
| `Result` | 7-10 | `Win`, `Draw`, `Lose`, `Unbeaten`, `WinToNil`, `WinHandicap_Minus1`, `DrawHTWinFT` |
| `BTTS` | 5-6 | `BTTS`, `BTTS_FirstHalf`, `BTTS_SecondHalf`, `BTTS_BothHalves`, `BTTS_Win` |
| `Goals` | 14-18 | `OVER0_5`–`OVER4_5`, `CleanSheet`, `FailedToScore`, `OVER1_5_2H`, `OVER0_5_1H` |
| `Half` | 18-22 | `Draw1H`, `Win1H`, `Lose1H`, `DrawHTWinFT`, `LoseHTLoseFT`, `MostGoals1H/2H` |
| `Cards` | 10-14 | `CardsOver3_5`–`CardsOver6_5`, `EachTeamCardsOver0_5`–`Over2_5`, `MostCards` |
| `Booking Points` | 10-14 | `BookingPointsOver25/35/45`, `EachTeamBookingPointsOver15/25`, `MostBookingPoints` |
| `Corners` | 30-40 | `EachTeamCornersOver2_5/3_5`, `MostCorners`, `MostCorners1H/2H`, `TeamCornersAg1H_Over1_5` |
| `Shots` | 28-34 | `MostShots`, `MostShotsOnTarget`, `TeamShotsOnTargetAg/ForOver/Under` |
| `Fouls` | 28-34 | `TeamFoulsAgOver`, `TeamFoulsForOver`, `TotalMatchFoulsOver` |
| `Offsides` | 10-14 | `TeamOffsidesAg/ForOver`, `TotalMatchOffsidesOver` |

**Total típico por lado:** 109-194 (avg 119).

**Padrão para a UI:**
- **Chips horizontais de grupo** sempre visíveis. Multi-select OR-dentro / AND-entre.
- **Slider threshold** sobre `overall_perc` (ex: ≥70% mostra só streaks fortes).
- **Filtro "ambos lados qualificam"** (replica `bothSidesMatch` de `badges.ts`).
- **Grid/heatmap** com células coloridas via `hsl(0, X%, Y%)` derivado de `overall_perc` — `--color-vermelho` saturação proporcional.
- **Sort default**: `overall_perc DESC` (mais quente primeiro).
- **cmdk command palette** (Cmd+K) busca textual em `stat_type` + `desc`.

---

## 5. `referee_record` — record do árbitro

**Forma (quando presente):**

```ts
{
  name: string;                        // "Stuart Attwell"
  completed: number;                   // jogos completos na temporada
  fixtures_count: number;              // total scheduled (pode ser != completed)
  avg_total_booking_points: number;    // 49.07 = média BP por jogo
  avg_home_booking_points: number;     // 19.26 = BP médio mandante
  avg_away_booking_points: number;     // 29.81 = BP médio visitante
  total_yellow_reds: number;           // total de 2 amarelos→vermelho na temp
}
```

⚠️ **Cobertura limitadíssima:** 3 de 80 fixtures no sample (apenas Premier League). Adamchoi/choistats só rastreia árbitros das ligas top (UK Big-5 majoritariamente).

**Padrão para a UI:**
- Card opcional "árbitro" com `avg_total_booking_points` (vermelho grande se >45) + split home/away + `total_yellow_reds`.
- **Omitir silenciosamente do layout** quando `null` — não usar placeholder morto.
- Highlight badge "cartão alto" quando bate threshold (já existe em `badges.ts`).

---

## 6. `odds_summary` — odds de pré-jogo

**Forma:**

```ts
Record<MarketName, MarketOptions>
where MarketOptions = Record<OutcomeName, { bookmaker: string, decimal_odds: number }>
```

**Cobertura:** 45 de 80 fixtures têm pelo menos 1 mercado; média 13 mercados quando presente, máx 39 (EPL Chelsea-Tottenham), min 0 (várias ligas LatAm 2ª divisão + Israel + India + China).

**39 mercados possíveis no sample (EPL):**

| Categoria | Mercados |
|---|---|
| **Match** | `Result` (1X2), `Double Chance`, `BTTS`, `Match Goals Overs/Unders`, `Result & BTTS`, `Half Time/Full Time`, `Win To Nil`, `Handicap Result` |
| **Halves** | `First Half Result`, `Second Half Result`, `First Half Total Goals`, `Second Half Total Goals`, `BTTS by Half`, `Highest scoring half`, `Score Both Halves` |
| **Teams** | `Team Goals Overs/Unders`, `First Half Team Goals`, `Second Half Team Goals`, `Team Cards`, `Team Corners`, `Team Booking Points`, `Team shots on target`, `Clean Sheet` |
| **Corners** | `Total Corners`, `Most Corners`, `Most corners 1st half`, `Most corners 2nd half`, `First Half Total Corners`, `First half team corners`, `BTTS & Overs` |
| **Cards/Booking** | `Total Cards`, `Total shots on target` |
| **Player props** | `Player to score anytime`, `Player to score first`, `Player to be shown a card`, `Player to carded first`, `Player shots on target`, `To assist`, `To score or assist` |

**Padrão para a UI:**
- **Browser de mercados** colapsado por categoria; oculto se `odds_summary` vazio.
- Cards "Result" no hero (1X2 + draw) com odds + book — destaque visual.
- Cards de `BTTS`, `Match Goals Overs/Unders 2.5`, `Total Cards Over 5.5` na seção "headline markets".
- Player props num **drawer dedicado** (39 mercados-pode dominar a tela se mostrar tudo).
- Tooltip mostra todas as casas + odd best vs market median.
- **Quando vazio:** omitir o painel inteiro (não mostrar "sem odds disponíveis").

---

## 7. `player_stats` — agregados + top players (SUBUTILIZADO)

**Forma:**

```ts
{
  home: { aggregates: Aggregates, top_players: Player[] }
  away: { aggregates: Aggregates, top_players: Player[] }
}
```

**`Aggregates` (16 campos):** somatório do elenco na temporada.

```ts
{
  players_count: number;   // 26
  minutes: number;
  goals: number;     goals_1h: number;   goals_2h: number;
  assists: number;
  yellows: number;   reds: number;       cards_1h: number;   cards_2h: number;
  total_shots: number;     shots_on_target: number;
  tackles: number;
  fouls_committed: number;  fouls_drawn: number;
  offsides: number;
}
```

**`Player` (22 campos):** array de **~11 top jogadores** por lado (no sample EPL veio 11; valor pode variar).

```ts
{
  name: string;            // "Enzo Fernández"
  injured: boolean;
  played: number;          // jogos
  started: number;
  subs: number;
  minutes: number;
  goals: number;     goals_1h: number;   goals_2h: number;
  first_goals: number;     // gols marcados como o 1º do time
  assists: number;
  yellows: number;   reds: number;       cards_1h: number;  cards_2h: number;
  first_cards: number;     // cartões puxados como 1º do time
  total_shots: number;     shots_on_target: number;
  tackles: number;
  fouls_committed: number;  fouls_drawn: number;
  offsides: number;
}
```

**Padrão para a UI (potencial alto — NÃO usado ainda):**
- **Painel "top scorers"** ordenado por goals (top 5 home + top 5 away lado a lado).
- **"Quem mete cartão"** ordenado por `yellows + reds * 2` ou `first_cards` (ouro pra player-prop "to be carded").
- **"Quem chuta a gol"** ordenado por `shots_on_target / played`.
- **"1H scorers"** (`goals_1h`) — pro mercado First half team goals.
- **Comparativo aggregates** entre lados (mini-table: gols/yellows/SOT da temporada inteira).
- Status `injured` → ícone red no nome do jogador.

---

## 8. `predictions` — previsões geradas pelo choistats

**Forma (quando presente):** array de previsões. Sempre vazio em fixtures EPL/Libertadores; populado em algumas ligas Tier 2/3 (Brasileirão Série B/C, Liga MX, Romania Liga 1, Bolivia, Ecuador). **Cobertura 11% no sample (9/80).**

```ts
{
  stat_type: string;          // "Over 8.5 Total Corners", "Over 25 Total Booking Points"
  chance: number;             // 0-100 (chance estimada)
  chance_team: string | null; // nome do time se aplica a um lado específico
  best_odds: number | null;   // melhor odd encontrada
  best_odds_bookmaker: string | null;
  home_stats: string[];       // explicações humanas curtas
  away_stats: string[];       // idem
}
```

**Padrão para a UI:**
- Card "Predictions oficiais (choistats)" — lista ordenada por `chance` DESC.
- Cada prediction: `stat_type` em destaque + `chance%` grande + `best_odds` (book) + bullets `home_stats` / `away_stats`.
- **Omitir o painel inteiro se array vazio** — não mostrar "sem previsões".
- Cor da chance: ≥80% verde, 60-80% amarelo, <60% cinza.

---

## 9. `trends` — vazio (backlog)

**Forma:** array. **0% de cobertura** no sample atual (80 fixtures). Provavelmente:
- O scraper não puxa (verificar `lib/fixtures/choistats-api.ts`).
- OU o endpoint só popula próximo do kickoff e nossos fixtures estão muito antecipados.
- OU é um campo deprecated do choistats.

**Ação:** abrir investigação no scraper. Deixar UI preparada (estrutura provável: array de "trend objects" com descrição + período). Painel oculto enquanto array vazio.

---

## Resumo de presença (sample de 80 fixtures)

| Seção | Presente | Avg quando presente |
|---|---|---|
| team_record | 100% | 12 campos × 2 splits × 2 lados |
| recent_matches | 100% | 10 jogos × 37 campos × 2 lados |
| h2h | 100% | até 10 × 37 campos |
| streaks | 100% | **119 entradas/lado avg** (109-194) |
| player_stats | 100% | 11 players + 16 aggregates × 2 lados |
| odds_summary | **56%** | 13 mercados avg (range 1-39) |
| predictions | **11%** | 4-7 entries quando presente |
| referee_record | **4%** | só EPL no sample |
| trends | **0%** | sempre vazio |

---

## Convenções de TS interface (proposta — TBD na implementação)

Quando criar `lib/fixtures/detail-json-types.ts`:

```ts
export interface DetailJson {
  team_record: TeamRecord;
  recent_matches: { home: RecentMatch[]; away: RecentMatch[] };
  h2h: RecentMatch[];
  streaks: { home: Streak[]; away: Streak[] };
  referee_record: RefereeRecord | null;
  odds_summary: Record<string, Record<string, { bookmaker: string; decimal_odds: number }>>;
  player_stats: { home: PlayerStatsSide; away: PlayerStatsSide };
  predictions: Prediction[];   // pode ser []
  trends: unknown[];           // tipo desconhecido — sempre []
}
```

⚠️ **Todos os tipos devem aceitar `null`/`undefined` em campos opcionais**. Caçar `?:` agressivamente; em produção tem fixture vindo sem `referee_record`, sem `odds_summary`, sem `predictions`.

---

## Histórico de revisão

| Data | Versão | Mudança | Autor |
|---|---|---|---|
| 2026-05-13 | 1.0 | Doc inicial — varredura de 80 fixtures via Supabase REST. | pilot+claude |
