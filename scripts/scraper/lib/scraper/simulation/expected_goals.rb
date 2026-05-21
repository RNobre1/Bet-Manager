module AdamStats
  module Scraper
    module Simulation
      # ExpectedGoals — proxy de xG a partir de shots + shots_on_target
      # quando o choistats NÃO fornece xG cru (POC 2026-05-21).
      #
      # Fórmula calibrada da literatura: xG ≈ 0.10*shots + 0.30*SoT.
      # Não é xG-real (que exigiria coordenadas espaciais do chute);
      # é proxy honesto usável como input alternativo ao avgGoalsFor.
      module ExpectedGoals
        SHOT_COEF = 0.10
        SOT_COEF = 0.30

        module_function

        def xg_from_match(total_shots:, shots_on_target:)
          ts = numf(total_shots)
          sot = numf(shots_on_target)
          return nil if ts.nil? || sot.nil? || ts.negative? || sot.negative?

          (SHOT_COEF * ts) + (SOT_COEF * sot)
        end

        def avg_xg_for_side(matches, side:)
          ts_key = "#{side}TotalShots"
          sot_key = "#{side}ShotsOnTarget"
          vals = Array(matches).map do |m|
            next nil unless m.is_a?(Hash)

            xg_from_match(total_shots: m[ts_key], shots_on_target: m[sot_key])
          end.compact
          return nil if vals.empty?

          vals.sum.to_f / vals.size
        end

        def numf(v)
          Float(v)
        rescue ArgumentError, TypeError
          nil
        end
        private_class_method :numf
      end
    end
  end
end
