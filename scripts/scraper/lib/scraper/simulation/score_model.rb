module AdamStats
  module Scraper
    module Simulation
      # ScoreModel — builds the (N+1)x(N+1) joint scoreline probability matrix
      # from two independent Poisson processes (λ_home, λ_away) with the
      # Dixon-Coles τ correction applied to the 4 low-score cells (spec §6.1).
      #
      #   τ(0,0) = 1 − λμρ
      #   τ(0,1) = 1 + λρ
      #   τ(1,0) = 1 + μρ
      #   τ(1,1) = 1 − ρ
      #
      # ρ = 0 ⇒ pure independent Poisson (parity). The corrected matrix is
      # re-normalized so it sums to ≈ 1.0. Pure / deterministic.
      module ScoreModel
        MAX_GOALS = 10

        module_function

        def matrix(lambda_home, lambda_away, rho, max_goals: MAX_GOALS)
          home_pmf = poisson_pmf(lambda_home, max_goals)
          away_pmf = poisson_pmf(lambda_away, max_goals)

          m = Array.new(max_goals + 1) do |i|
            Array.new(max_goals + 1) { |j| home_pmf[i] * away_pmf[j] }
          end

          unless rho.zero?
            m[0][0] *= 1 - (lambda_home * lambda_away * rho)
            m[0][1] *= 1 + (lambda_home * rho)
            m[1][0] *= 1 + (lambda_away * rho)
            m[1][1] *= 1 - rho
            # τ can drive a cell slightly negative for extreme ρ — clamp.
            m.each { |row| row.map! { |v| v.negative? ? 0.0 : v } }
          end

          normalize!(m)
        end

        def poisson_pmf(lambda, max_goals)
          # pmf(k) = λ^k e^-λ / k!  built iteratively to avoid huge factorials.
          pmf = Array.new(max_goals + 1, 0.0)
          term = Math.exp(-lambda)
          pmf[0] = term
          (1..max_goals).each do |k|
            term *= lambda / k
            pmf[k] = term
          end
          pmf
        end
        private_class_method :poisson_pmf

        def normalize!(matrix)
          total = matrix.flatten.sum
          return matrix if total.zero?

          matrix.each { |row| row.map! { |v| v / total } }
          matrix
        end
        private_class_method :normalize!
      end
    end
  end
end
