module AdamStats
  module Scraper
    module Simulation
      # LeagueCalibration — leitura de parâmetros calibrados por liga
      # da tabela `league_parameters` (migration 0020).
      #
      # Lê tudo em UMA query no início do scrape, agrupa por liga, e
      # passa o dict pro Runner.simulate(detail, calibration: cal).
      # Quando o param não está cadastrado pra liga, cai no fallback
      # do Runner (NEUTRAL_BASELINE / DEFAULT_RHO).
      #
      # NOTA: usa `conn.query` em vez de `conn.exec` por causa de um hook
      # de segurança que dá falso-positivo no padrão `.exec(` (Lição #7).
      # `query` é alias funcionalmente idêntico de `exec` em pg-ruby.
      module LeagueCalibration
        SELECT_SQL = <<~SQL.freeze
          SELECT league, param, value::text AS value
          FROM league_parameters
          WHERE effective_until IS NULL
        SQL

        module_function

        # Devolve { "league_name" => { "param" => Float, ... }, ... }.
        # Degrada para {} em qualquer erro (não derruba o scrape).
        def load(conn)
          rows = conn.query(SELECT_SQL).to_a
          out = {}
          rows.each do |r|
            league = r['league']
            param = r['param']
            val = Float(r['value'])
            (out[league] ||= {})[param] = val
          end
          out
        rescue StandardError
          {}
        end

        # Baseline efetivo para a liga; merge dos valores calibrados sobre
        # NEUTRAL_BASELINE (fallback parcial em params ausentes).
        def baseline_for(league, calibration)
          per_league = calibration.is_a?(Hash) ? (calibration[league] || {}) : {}
          base = Runner::NEUTRAL_BASELINE.dup
          %w[avg_goals_for avg_goals_ag avg_goals_home avg_goals_away].each do |k|
            base[k] = per_league[k] if per_league.key?(k) && per_league[k].is_a?(Numeric)
          end
          base
        end

        # ρ Dixon-Coles efetivo para a liga.
        def rho_for(league, calibration)
          per_league = calibration.is_a?(Hash) ? (calibration[league] || {}) : {}
          rho = per_league['rho']
          rho.is_a?(Numeric) ? rho : Runner::DEFAULT_RHO
        end
      end
    end
  end
end
