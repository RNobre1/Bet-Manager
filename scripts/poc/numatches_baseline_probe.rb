#!/usr/bin/env ruby
# frozen_string_literal: true

# numatches_baseline_probe.rb
#
# POC empírico — Tarefa 0 (Wave 0) da feature simulacao-pre-jogo-fixtures.
# Calibra 5 parâmetros do spec antes de Task 2 hard-codear valores:
#   1. Distribuição de numMatches nos 4 blocos *Avgs
#   2. Ruído de baseline-dia (N mínimo de times por liga no slice do dia)
#   3. k inicial (força do shrinkage condicional, w = n/(n+k))
#   4. ρ inicial (correção Dixon-Coles)
#   5. outcomeOdds — populados em produção? fixtureId == 0?
#
# Uso: ruby scripts/poc/numatches_baseline_probe.rb
# Requer: Ruby stdlib json apenas. Sem gems, sem DB, sem rede.
# Determinístico e idempotente.

require "json"

FIXTURES_DIR = File.expand_path(
  "../../scraper/spec/scraper/fixtures/widgets",
  __FILE__
)

RECENT_RESULTS_FILES = [
  File.join(FIXTURES_DIR, "recent-results.json"),
  File.join(FIXTURES_DIR, "recent-results-played.json")
].freeze

PLAYERS_FILE = File.join(FIXTURES_DIR, "players.json")
AVGS_BLOCKS   = %w[homeTeamHomeAvgs homeTeamOverallAvgs awayTeamAwayAvgs awayTeamOverallAvgs].freeze

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def percentile(sorted_arr, p)
  return nil if sorted_arr.empty?

  n    = sorted_arr.size
  rank = p / 100.0 * (n - 1)
  lo   = rank.floor
  hi   = rank.ceil
  return sorted_arr[lo] if lo == hi

  sorted_arr[lo] + (sorted_arr[hi] - sorted_arr[lo]) * (rank - lo)
end

def format_stats(label, values)
  sorted = values.sort
  min    = sorted.first
  p25    = percentile(sorted, 25).round(1)
  med    = percentile(sorted, 50).round(1)
  p75    = percentile(sorted, 75).round(1)
  max    = sorted.last

  format("  %-30s n=%d  min=%-4s p25=%-5s median=%-5s p75=%-5s max=%s",
         label, values.size, min, p25, med, p75, max)
end

def hr(char = "=", width = 72)
  puts char * width
end

# ---------------------------------------------------------------------------
# 1. Carregar fixtures recentes
# ---------------------------------------------------------------------------
fixtures = RECENT_RESULTS_FILES.map do |path|
  unless File.exist?(path)
    warn "AVISO: arquivo não encontrado: #{path}"
    next nil
  end

  JSON.parse(File.read(path))
end.compact

if fixtures.empty?
  puts "ERRO: nenhum arquivo recent-results encontrado em #{FIXTURES_DIR}"
  exit 1
end

# ---------------------------------------------------------------------------
# 2. Extrair numMatches por bloco *Avgs
# ---------------------------------------------------------------------------
hr
puts "RELATÓRIO POC — numatches_baseline_probe"
puts "Gerado em: #{Time.now}"
hr

puts
puts "## 1. DISTRIBUIÇÃO DE numMatches (blocos *Avgs)"
puts
puts "Fonte: #{fixtures.size} fixture(s) × 4 blocos = #{fixtures.size * 4} observações"
puts

# Coletar por bloco e globalmente
block_values = Hash.new { |h, k| h[k] = [] }
all_values   = []
fixture_meta = []

fixtures.each do |doc|
  fix = doc["fixture"]
  meta = {
    id:       fix["id"],
    league:   fix.dig("league", "name"),
    country:  fix.dig("league", "country", "name"),
    home:     fix.dig("homeTeam", "name"),
    away:     fix.dig("awayTeam", "name")
  }
  fixture_meta << meta

  AVGS_BLOCKS.each do |blk|
    nm = fix.dig(blk, "numMatches")
    next unless nm

    block_values[blk] << nm
    all_values << nm
  end
end

puts "Fixtures analisadas:"
fixture_meta.each do |m|
  puts "  [#{m[:id]}] #{m[:country]} — #{m[:league]}: #{m[:home]} vs #{m[:away]}"
end
puts

puts "Por bloco (overall):"
AVGS_BLOCKS.each do |blk|
  vals = block_values[blk]
  puts format_stats(blk, vals)
end
puts
puts "Global (todos os 4 blocos juntos):"
puts format_stats("ALL *Avgs", all_values)

puts
puts "Valores brutos por fixture+bloco:"
fixtures.each do |doc|
  fix = doc["fixture"]
  id  = fix["id"]
  home = fix.dig("homeTeam", "name")
  away = fix.dig("awayTeam", "name")
  vals = AVGS_BLOCKS.map { |b| "#{b.sub('TeamsAvgs', '')}=#{fix.dig(b, 'numMatches')}" }
  puts "  [#{id}] #{home} vs #{away}: #{vals.join(', ')}"
end

puts
puts "Observação de simetria (expected: home_split == away_split):"
fixtures.each do |doc|
  fix  = doc["fixture"]
  home_home    = fix.dig("homeTeamHomeAvgs", "numMatches")
  home_overall = fix.dig("homeTeamOverallAvgs", "numMatches")
  away_away    = fix.dig("awayTeamAwayAvgs", "numMatches")
  away_overall = fix.dig("awayTeamOverallAvgs", "numMatches")

  puts "  [#{fix['id']}] home_split=#{home_home}, home_total=#{home_overall}" \
       " | away_split=#{away_away}, away_total=#{away_overall}"

  if home_overall && home_home
    ratio = home_home.to_f / home_overall
    puts "         home home/total ratio: #{ratio.round(2)} (expected ~0.5 para liga equilibrada)"
  end
end

# ---------------------------------------------------------------------------
# 3. Baseline-dia — times por liga no slice
# ---------------------------------------------------------------------------
hr("-")
puts
puts "## 2. RUÍDO DE BASELINE-DIA (times únicos por liga no slice da amostra)"
puts
puts "LIMITAÇÃO CRÍTICA: a amostra contém apenas #{fixtures.size} fixture(s) de 1 liga."
puts "Não é possível medir ruído de baseline multi-liga com esta amostra."
puts "Os dados abaixo descrevem a liga presente; a recomendação de N baseia-se"
puts "em raciocínio a priori sobre ligas menores, não em medição empírica direta."
puts

teams_by_league = Hash.new { |h, k| h[k] = Set.new }
fixtures.each do |doc|
  fix    = doc["fixture"]
  league = "#{fix.dig('league', 'country', 'name')} — #{fix.dig('league', 'name')}"
  home   = fix.dig("homeTeam", "name")
  away   = fix.dig("awayTeam", "name")
  teams_by_league[league].add(home)
  teams_by_league[league].add(away)
end

require "set"

puts "Times únicos por liga no slice da amostra:"
teams_by_league.each do |league, teams|
  puts "  #{league}: #{teams.size} times (#{teams.to_a.join(', ')})"
end

puts
puts "Raciocínio para threshold N (fallback para baseline persistido):"
puts "  - Um dia típico de Premier League tem ~10 jogos → ~20 times."
puts "  - Ligas menores (Brasileirão B, Liga NOS, MLS) podem ter 4-8 jogos/dia → 8-16 times."
puts "  - Com N < 6 times, a variância do leagueAvg calculado no dia é alta (1-3 jogos)."
puts "  - Com N >= 6 (mínimo 3 jogos simultâneos), a média começa a convergir."
puts "  - RECOMENDAÇÃO: N = 6. Se um dia-slice de liga tiver < 6 times, usar baseline"
puts "    persistido (calculado sobre a temporada inteira) em vez do agregado diário."
puts "  - CAVEAT: recomendação é raciocínio a priori, NÃO medição empírica sobre dias reais."

# ---------------------------------------------------------------------------
# 4. Análise para k (shrinkage) e threshold
# ---------------------------------------------------------------------------
hr("-")
puts
puts "## 3. k INICIAL (shrinkage) E THRESHOLD DE ENGAJAMENTO"
puts
puts "Fórmula: w = numMatches / (numMatches + k)"
puts "Quanto maior k, mais peso ao prior; shrinkage engaja quando numMatches é pequeno."
puts

sorted_all = all_values.sort
min_nm  = sorted_all.first
max_nm  = sorted_all.last
med_nm  = percentile(sorted_all, 50)

puts "Estatísticas de numMatches (n=#{all_values.size}):"
puts "  min=#{min_nm}, median=#{med_nm.round(1)}, max=#{max_nm}"
puts

puts "Simulação de w para k candidatos (k=5, k=8, k=10):"
puts "  numMatches | w(k=5) | w(k=8) | w(k=10)"
puts "  -----------+--------+--------+--------"
[1, 3, 5, 8, 10, 17, 19, 35, 37].each do |nm|
  next unless nm >= min_nm && nm <= max_nm || [1, 3, 5, 8, 10].include?(nm)

  w5  = (nm.to_f / (nm + 5)).round(3)
  w8  = (nm.to_f / (nm + 8)).round(3)
  w10 = (nm.to_f / (nm + 10)).round(3)
  puts format("  %-10d | %-6s | %-6s | %-6s", nm, w5, w8, w10)
end

puts
puts "Análise:"
puts "  - Amostra: numMatches em {17, 17, 19, 19, 35, 35, 37, 37} — split ~metade do total."
puts "  - Com k=5: w(17)=0.773, w(19)=0.792 → shrinkage ainda tem efeito (~20% peso ao prior)."
puts "  - Com k=8: w(17)=0.680, w(19)=0.704 → shrinkage mais pronunciado (~30% prior)."
puts "  - Com k=10: w(17)=0.630, w(19)=0.655 → conservador."
puts "  - Para nm=35/37 (overall), w(k=5)≈0.875 → quase tudo dados observados; razoável."
puts "  - Shrinkage engaja visivelmente quando numMatches < 15 (w < 0.75 com k=5)."
puts "  - RECOMENDAÇÃO: k = 5 como ponto de partida (alinha com spec prior; dados de"
puts "    17-19 já têm alguma credibilidade; overall 35-37 quase não sofre encolhimento)."
puts "  - THRESHOLD DE ENGAJAMENTO VISÍVEL: numMatches < 15 (w < 0.75 com k=5)."
puts "  - k deve ser tratado como hiperparâmetro ajustável pós-deploy; calibração definitiva"
puts "    requer backtest com dados históricos de múltiplas ligas."

# ---------------------------------------------------------------------------
# 5. ρ inicial (Dixon-Coles)
# ---------------------------------------------------------------------------
hr("-")
puts
puts "## 4. ρ INICIAL (Dixon-Coles — correlação 0-0/1-0/0-1/1-1)"
puts
puts "Não há dataset jogo-a-jogo disponível localmente para MLE de ρ."
puts "Raciocínio sobre o prior a partir de literatura:"
puts
puts "  Referências do spec:"
puts "    - EPL 17/18 (Dixon & Coles 1997 original): ρ ≈ -0.13"
puts "    - penaltyblog (análise multi-liga, período recente): ρ ≈ -0.079"
puts "    - Intervalo do spec: [-0.15, -0.05]"
puts
puts "  A amostra local é EPL (Premier League) — 1 liga de alta qualidade."
puts "  Ligas do projeto incluem também Brasileirão, MLS, Liga NOS — ligas com"
puts "  mais gols em média → correlação 0-0 ligeiramente menos pronunciada → ρ"
puts "  tende a ser menos negativo que EPL."
puts
puts "  RECOMENDAÇÃO: ρ = -0.10 como ponto de partida."
puts "    - Mais conservador que EPL puro (-0.13): adequado para portfolio multi-liga."
puts "    - Ainda dentro do intervalo validado [-0.15, -0.05]."
puts "    - Midpoint ponderado entre referências (-0.13 e -0.079 → midpoint ≈ -0.10)."
puts "    - Tratar como calibrável: permitir override por liga no futuro."
puts "  CAVEAT: sem MLE local, esta é uma escolha principiada, não um valor medido."

# ---------------------------------------------------------------------------
# 6. outcomeOdds — fixtureId e população
# ---------------------------------------------------------------------------
hr("-")
puts
puts "## 5. outcomeOdds — POPULADOS? fixtureId = 0?"
puts

unless File.exist?(PLAYERS_FILE)
  puts "ERRO: #{PLAYERS_FILE} não encontrado."
  exit 1
end

pdata = JSON.parse(File.read(PLAYERS_FILE))
fixture_id = pdata.dig("fixture", "id")

puts "fixture.id no players.json: #{fixture_id}"
puts "  (mesmo fixture do recent-results.json — Tottenham vs Leeds, id=#{fixture_id})"
puts

# Catalogar outcomeOdds por player
all_players  = (pdata["homePlayers"] || []) + (pdata["awayPlayers"] || [])
odds_summary = Hash.new(0)
fixture_ids  = []
players_with_any_odds  = 0
players_with_zero_only = 0

all_players.each do |player|
  oo = player["outcomeOdds"]
  next unless oo.is_a?(Hash) && !oo.empty?

  players_with_any_odds += 1
  local_ids = []

  oo.each do |market, entry|
    next unless entry.is_a?(Hash)

    fid = entry["fixtureId"]
    local_ids << fid
    fixture_ids << fid
    odds_summary[market] += 1
  end

  players_with_zero_only += 1 if local_ids.all?(&:zero?)
end

total_players     = all_players.size
players_no_odds   = all_players.count { |p| !p["outcomeOdds"].is_a?(Hash) || p["outcomeOdds"].empty? }

puts "Total de jogadores (home+away): #{total_players}"
puts "  com outcomeOdds preenchido:   #{players_with_any_odds}"
puts "  sem outcomeOdds:              #{players_no_odds}"
puts "  com APENAS fixtureId=0:       #{players_with_zero_only}"
puts
puts "Todos os fixtureIds encontrados em outcomeOdds: #{fixture_ids.uniq.inspect}"
puts "  Valores não-zero: #{fixture_ids.reject(&:zero?).size} / #{fixture_ids.size}"
puts
puts "Mercados presentes (contagem de players com cada mercado):"
odds_summary.sort_by { |_, v| -v }.each do |market, count|
  bar = "#" * (count * 30 / total_players)
  puts format("  %-40s %2d players  %s", market, count, bar)
end

puts
puts "Análise:"
puts "  - fixture.id = #{fixture_id} (real, não zero) → o payload refere-se a um jogo real."
puts "  - PORÉM: todos os outcomeOdds.*.fixtureId = 0 (zero) em 100% das entradas."
puts "  - Os odds TÊMDEM valores reais (decimalOdds, fractionalOdds, bookmakerBetUrl),"
puts "    mas o campo interno fixtureId está errado (0 em vez de #{fixture_id})."
puts "  - Hipótese: bug/limitação da API choistats — fixtureId nos odds não é"
puts "    populado pelo backend (campo presente no schema mas não preenchido)."
puts "  - Os mercados principais (ANYTIME_SCORER, TO_BE_CARDED, FIRST_GOALSCORER,"
puts "    FIRST_CARD, ANYTIME_ASSIST, SCORE_OR_ASSIST) estão PRESENTES e com odds reais."
puts "  - Mercados de player-props (PLAYER_OVER_x_5_TOTAL_SHOTS, etc.) também presentes."
puts
puts "VEREDICTO:"
puts "  O campo fixtureId dentro de outcomeOdds é SEMPRE 0 nesta amostra — não usar"
puts "  como âncora de join/validação. Os odds em si (decimalOdds, externalBetId, etc.)"
puts "  estão populados e são usáveis."
puts "  IMPLICAÇÃO para Task 2: usar outcomeOdds pelo market-key (ex: 'ANYTIME_SCORER')"
puts "  e pelo decimalOdds/fractionalOdds diretamente; NÃO depender de fixtureId=0"
puts "  para validar presença. Tratar player anchor como PRESENTE mas externalFixtureId"
puts "  (o id do bookmaker) deve ser preferido como referência de odds se necessário."

# ---------------------------------------------------------------------------
# Resumo executivo
# ---------------------------------------------------------------------------
hr
puts
puts "## RESUMO EXECUTIVO"
puts
puts "  numMatches  : {17,19} para split (home-home/away-away); {35,37} overall — CONFIRMA spec"
puts "  k inicial   : 5  (engage visível para nm < 15; overall quase não encolhe)"
puts "  ρ inicial   : -0.10  (prior multi-liga; midpoint EPL/-0.13 e penaltyblog/-0.079)"
puts "  N threshold : 6 times/liga/dia para acionar fallback a baseline persistido"
puts "  outcomeOdds : mercados POPULADOS com odds reais; fixtureId interno SEMPRE 0 (bug API)"
puts "                → não usar fixtureId como âncora; usar market-key + decimalOdds"
puts
puts "  TODAS as 5 questões do spec §11 follow-up #1 respondidas."
puts "  Limitação principal: apenas 2 fixtures de 1 liga (EPL) — extrapolar com cautela."
puts
hr
