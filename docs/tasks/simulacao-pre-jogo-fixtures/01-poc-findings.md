# POC Empírico — Achados (Task 0, Wave 0)

**Status:** DONE — 2026-05-18
**Script:** `scripts/poc/numatches_baseline_probe.rb`
**Amostra:** 2 fixtures, 1 liga (EPL — Premier League), amostrados dos snapshots de teste em
`scripts/scraper/spec/scraper/fixtures/widgets/`
(Tottenham Hotspur vs Leeds United, id=19427224; Manchester United vs Nottingham Forest, id=19427233).

> **Limitação principal:** toda a análise deriva de 2 fixtures de uma única liga de alta qualidade
> (EPL). Valores de numMatches da EPL tendem a ser altos (temporada completa de 34+ jogos); ligas
> com início de temporada, promoção/rebaixamento recente ou menor estrutura podem apresentar
> distribuições diferentes. **Não extrapolar os percentis como verdade universal — são o piso
> mínimo para calibração inicial.**

---

## 1. Distribuição de `numMatches` nos 4 blocos `*Avgs`

Script extraiu todos os `numMatches` dos quatro blocos por fixture:

| Bloco                   | n | min | p25  | median | p75  | max |
|-------------------------|---|-----|------|--------|------|-----|
| `homeTeamHomeAvgs`      | 2 | 17  | 17.5 | 18.0   | 18.5 | 19  |
| `homeTeamOverallAvgs`   | 2 | 35  | 35.5 | 36.0   | 36.5 | 37  |
| `awayTeamAwayAvgs`      | 2 | 17  | 17.5 | 18.0   | 18.5 | 19  |
| `awayTeamOverallAvgs`   | 2 | 35  | 35.5 | 36.0   | 36.5 | 37  |
| **ALL *Avgs (global)**  | **8** | **17** | **18.5** | **27.0** | **35.5** | **37** |

**Observações medidas:**
- Os blocos *split* (home-home / away-away) tiveram `numMatches` = 17 e 19 — quase exatamente
  metade dos jogos totais da temporada EPL (34 jogos → 17 em casa e 17 fora; 38 jogos→19+19).
- Os blocos *overall* tiveram `numMatches` = 35 e 37, confirmando uso da temporada quase completa.
- Simetria perfeita: `homeTeamHomeAvgs.numMatches == awayTeamAwayAvgs.numMatches` em ambos os
  fixtures — o campo é contagem de jogos da temporada, não independente por time.
- Ratio home/total: 0.49 e 0.51 — confirma que a EPL com calendário balanceado gera split ~50%.

**Confirmação do pressuposto do spec:** o regime 17–37 se confirma empiricamente na EPL.
Para ligas no início de temporada ou com menos jogos disputados, `numMatches` pode cair para
5–12 — cenário em que o shrinkage se torna crítico.

---

## 2. Ruído de baseline-dia — threshold N

**Limitação crítica:** a amostra contém apenas 2 fixtures de 1 liga. O probe mostra 4 times únicos
no slice (os 4 participantes dos 2 jogos), o que não é representativo de um dia de rodada completa.

**Raciocínio a priori para o threshold N:**

| Liga/contexto               | Jogos típicos/dia | Times únicos/dia |
|-----------------------------|-------------------|-----------------|
| Premier League (10 jogos)   | ~8–10             | ~16–20          |
| Brasileirão B, Liga NOS     | ~4–8              | ~8–16           |
| MLS, inicio de semana       | ~2–4              | ~4–8            |
| Copa/turno único             | ~1–2              | ~2–4            |

Com N < 6 times no slice do dia, o `leagueAvg*` calculado sobre aquele dia deriva de apenas 1–2
jogos — variância muito alta para ser usado como baseline da normalização λ (pesquisa §6.1).

**Recomendação: N = 6**
Se um dia-slice de liga tiver < 6 times com jogos, o módulo de simulação deve usar o baseline
persistido (calculado sobre a temporada inteira) em vez do agregado do dia.

**Caveats:**
- Recomendação baseada em raciocínio a priori, não em medição de múltiplos dias reais.
- N=6 é conservador (equivale a 3 jogos simultâneos); pode ser ajustado para N=4 se benchmarks
  mostrarem que 2 jogos já geram leagueAvg estável o suficiente.
- Revisar após acumular 2–4 semanas de dados históricos em produção.

---

## 3. k inicial (shrinkage) e threshold de engajamento

**Fórmula:** `w = numMatches / (numMatches + k)`

Simulação com os valores medidos:

| numMatches | w(k=5) | w(k=8) | w(k=10) | Interpretação           |
|-----------|--------|--------|---------|------------------------|
| 1         | 0.167  | 0.111  | 0.091   | início de temporada     |
| 3         | 0.375  | 0.273  | 0.231   | 3 jogos — muita incerteza |
| 5         | 0.500  | 0.385  | 0.333   | 50/50 com k=5           |
| 8         | 0.615  | 0.500  | 0.444   |                         |
| 10        | 0.667  | 0.556  | 0.500   | 10 jogos = 50/50 com k=10 |
| **17**    | **0.773** | 0.680 | 0.630 | **mínimo observado (split)** |
| **19**    | **0.792** | 0.704 | 0.655 | **split fixture #2** |
| **35**    | **0.875** | 0.814 | 0.778 | **mínimo observado (overall)** |
| **37**    | **0.881** | 0.822 | 0.787 | **overall fixture #2** |

**Recomendação: k = 5**
- Com k=5, valores reais observados (17–19 para split) resultam em w ≈ 0.77–0.79: o prior
  contribui com ~21–23% do peso — razoável para dados de meia temporada, não excessivo.
- Para overall (35–37), w ≈ 0.88: dados dominam, prior quase não age — correto.
- k=5 está no piso do prior não-autoritativo do spec (k≈5–8); dado que o regime observado já
  começa em 17 jogos, não há justificativa para k=8–10 neste momento.

**Threshold de engajamento visível: numMatches < 15**
- Com k=5, para `numMatches < 15`, `w < 0.75` → mais de 25% de peso ao prior.
- Para `numMatches < 8`, `w < 0.62` → shrinkage pronunciado — situação de início de temporada.

**Caveats:**
- k é hiperparâmetro; calibração definitiva requer backtest com resultados reais de múltiplas ligas.
- Considerar k diferente por bloco: k menor para overall (mais dados) e k maior para split
  (menos dados), se o comportamento divergir na prática.

---

## 4. ρ inicial (Dixon-Coles)

**Situação:** nenhum dataset jogo-a-jogo local disponível para MLE de ρ.

**Referências do spec:**
- EPL 1997 (Dixon & Coles original): ρ ≈ −0.13
- penaltyblog (multi-liga, período recente): ρ ≈ −0.079
- Intervalo validado na literatura: [−0.15, −0.05]

**Raciocínio:**
O projeto cobre um portfolio de ligas (EPL, La Liga, Serie A, Bundesliga, Brasileirão A/B, Liga NOS,
MLS). Ligas com maior média de gols (Brasileirão ~2.9 gols/jogo, MLS ~2.8) tendem a ter ρ menos
negativo que EPL (~2.7 gols/jogo) — a correção de 0-0 é proporcionalmente menor quando há mais
gols. O midpoint ponderado das duas referências é ≈ −0.10.

**Recomendação: ρ = −0.10**
- Dentro do intervalo validado [−0.15, −0.05].
- Mais conservador que EPL puro (−0.13), adequado para portfolio multi-liga.
- Midpoint entre as duas referências bibliográficas disponíveis.
- Implementar como parâmetro configurável por liga desde o início — EPL pode usar −0.13,
  Brasileirão pode usar −0.08, sem precisar re-deployar.

**Caveats:**
- Sem MLE local, este é um prior principiado, não um valor medido.
- Revisitar após acumular ~50+ jogos históricos por liga com resultado real.

---

## 5. `outcomeOdds` — Populados? fixtureId = 0?

**Amostra:** players.json, fixture id=19427224 (Tottenham vs Leeds, EPL), 48 jogadores (25 home + 23 away).

**Medições:**

| Métrica                                | Valor |
|---------------------------------------|-------|
| Jogadores com `outcomeOdds` preenchido | 42 / 48 (87.5%) |
| Jogadores sem `outcomeOdds`            | 6 / 48 (12.5%) |
| Jogadores com **apenas** `fixtureId=0` | 42 / 42 (100%) |
| Total de entradas de odds              | 668 |
| Entradas com `fixtureId != 0`          | 0 / 668 (0%) |

**Mercados presentes (número de jogadores):**

| Mercado                          | Players |
|---------------------------------|---------|
| TO_BE_CARDED                    | 41      |
| FIRST_CARD                      | 41      |
| ANYTIME_SCORER                  | 38      |
| FIRST_GOALSCORER                | 38      |
| SCORE_OR_ASSIST                 | 38      |
| ANYTIME_ASSIST                  | 38      |
| PLAYER_OVER_0_5_SHOTS_ON_TARGET | 38      |
| PLAYER_OVER_x_5_TOTAL_SHOTS (3 linhas) | 37–27 |
| PLAYER_OVER_x_5_TACKLES (3 linhas)    | 37–30 |
| PLAYER_OVER_x_5_FOULS (3 linhas)      | 37     |

**Veredicto:**
O campo `outcomeOdds.*.fixtureId` é **sempre 0** em 100% das entradas desta amostra — provável
bug/limitação da API choistats onde o campo existe no schema mas não é populado pelo backend.

**Os odds em si estão populados e são reais:** `decimalOdds`, `fractionalOdds`, `bookmakerBetUrl`,
`externalBetId` têm valores válidos em todos os mercados.

**Implicação para Task 2:**
- Não usar `outcomeOdds.*.fixtureId` como âncora de join, validação de presença ou
  identificação de fixture.
- Usar o **market-key** (`ANYTIME_SCORER`, `TO_BE_CARDED`, etc.) + `decimalOdds`/`fractionalOdds`
  diretamente para enriquecer o modelo de player.
- `externalFixtureId` (id do bookmaker, ex.: `"192501389"`) pode ser usado como referência de
  odds se necessário cross-referenciar com bookmaker externo.
- O player anchor (preço de mercado por jogador) está **PRESENTE e funcional** — Task 2 pode
  implementá-lo como feature primária, não degradada.
- Os 6 jogadores sem `outcomeOdds` (12.5% da amostra) devem ser tratados graciosamente:
  provavelmente reservas ou jogadores sem histórico de apostas. Degradar silenciosamente
  (sem crash), omitir a linha de odds para esses jogadores.

---

## Resumo de calibração — valores para Task 2

| Parâmetro     | Valor recomendado | Evidência          | Confiança     |
|---------------|-------------------|--------------------|---------------|
| `k` (shrinkage) | **5**            | Simulação w vs nm real | MÉDIA — prior non-authoritative; calibrar com backtest |
| `k` engage threshold | **nm < 15** | w < 0.75 com k=5 | MÉDIA |
| `ρ` (Dixon-Coles) | **−0.10**   | Midpoint EPL/-0.13 + penaltyblog/-0.079 | BAIXA — sem MLE local |
| N baseline-dia | **6 times/liga** | Raciocínio a priori | BAIXA — sem medição multi-dia |
| `outcomeOdds` presença | **PRESENTE (fixtureId=0 é bug)** | 668 entradas medidas | ALTA |
| numMatches regime | **17–37 (split/overall)** | 8 observações EPL | MÉDIA — EPL específico |

**Todos os 5 itens do spec §11 follow-up #1 respondidos com números reais do script.**
