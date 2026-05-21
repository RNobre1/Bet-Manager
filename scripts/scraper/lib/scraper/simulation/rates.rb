require_relative 'expected_goals'

module AdamStats
  module Scraper
    module Simulation
      # Rates — derives the Poisson rate parameters λ_home / λ_away from the
      # season strength blocks (`avgs.home_home`, `avgs.away_away`) normalized
      # by the league baseline, applying conditional shrinkage (spec §6.1/§6.4).
      #
      # Pure / deterministic. Returns nil (degrade, never raise) when the avgs
      # block is missing/insufficient or the league baseline has zero divisors.
      module Rates
        # Conditional shrinkage strength (calibrated in the T0 POC).
        K = 5.0
        # Shrinkage engages only when num_matches < this threshold (POC: w<0.75).
        SHRINK_THRESHOLD = 15

        module_function

        # detail      — enriched detail_json (string or symbol keys tolerated).
        # league_avgs  — day-slice league baseline hash with avg_goals_for /
        #                avg_goals_ag / avg_goals_home / avg_goals_away.
        # use_xg_proxy — F7: when true, replace avgGoalsFor (offensive side
        #                only) with the xG-proxy mean of recent_matches.
        #                Defaults to false ⇒ byte-identical legacy path.
        def lambdas(detail, league_avgs, use_xg_proxy: false)
          avgs = dig(detail, 'avgs')
          return nil unless avgs.is_a?(Hash)

          home = dig(avgs, 'home_home')
          away = dig(avgs, 'away_away')
          return nil unless home.is_a?(Hash) && away.is_a?(Hash)

          lg_for  = num(league_avgs, 'avg_goals_for')
          lg_ag   = num(league_avgs, 'avg_goals_ag')
          lg_home = num(league_avgs, 'avg_goals_home')
          lg_away = num(league_avgs, 'avg_goals_away')
          return nil if [lg_for, lg_ag, lg_home, lg_away].any? { |v| v.nil? || v <= 0 }

          h_for_default = shrunk(home, 'avgGoalsFor', lg_for)
          h_ag          = shrunk(home, 'avgGoalsAg',  lg_ag)
          a_for_default = shrunk(away, 'avgGoalsFor', lg_for)
          a_ag          = shrunk(away, 'avgGoalsAg',  lg_ag)
          return nil if [h_for_default, h_ag, a_for_default, a_ag].any?(&:nil?)

          h_for = h_for_default
          a_for = a_for_default
          if use_xg_proxy
            rm = dig(detail, 'recent_matches') || {}
            xg_h = ExpectedGoals.avg_xg_for_side(Array(dig(rm, 'home')), side: 'home')
            xg_a = ExpectedGoals.avg_xg_for_side(Array(dig(rm, 'away')), side: 'away')
            if xg_h && xg_a && xg_h.positive? && xg_a.positive?
              h_for = xg_h
              a_for = xg_a
            end
          end

          lambda_home = (h_for / lg_for) * (a_ag / lg_ag) * lg_home
          lambda_away = (a_for / lg_for) * (h_ag / lg_ag) * lg_away
          return nil unless finite_positive?(lambda_home) && finite_positive?(lambda_away)

          { home: lambda_home, away: lambda_away }
        end

        # θ̂ = w·θ_team + (1−w)·θ_league, w = n/(n+k), only when n < threshold.
        def shrunk(block, metric, league_value)
          team = num(block, metric)
          return nil if team.nil?

          n = num(block, 'num_matches') || num(block, 'numMatches')
          return team if n.nil? || n >= SHRINK_THRESHOLD

          w = n / (n + K)
          (w * team) + ((1 - w) * league_value)
        end
        private_class_method :shrunk

        def finite_positive?(v)
          v.is_a?(Numeric) && v.finite? && v > 0
        end
        private_class_method :finite_positive?

        def dig(obj, key)
          return nil unless obj.is_a?(Hash)

          obj[key] || obj[key.to_sym]
        end
        private_class_method :dig

        def num(obj, key)
          v = dig(obj, key)
          return nil if v.nil?

          Float(v)
        rescue ArgumentError, TypeError
          nil
        end
        private_class_method :num
      end
    end
  end
end
