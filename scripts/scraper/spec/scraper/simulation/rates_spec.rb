require_relative '../../../lib/scraper/simulation/rates'

RSpec.describe AdamStats::Scraper::Simulation::Rates do
  # Spec §6.1 formula:
  #   λ_home = (homeTeamHomeAvgs.avgGoalsFor / leagueAvgGoalsFor)
  #          × (awayTeamAwayAvgs.avgGoalsAg  / leagueAvgGoalsAg)
  #          × leagueAvgGoalsHome
  #   λ_away = (awayTeamAwayAvgs.avgGoalsFor / leagueAvgGoalsFor)
  #          × (homeTeamHomeAvgs.avgGoalsAg  / leagueAvgGoalsAg)
  #          × leagueAvgGoalsAway

  let(:detail) do
    {
      'avgs' => {
        'home_home' => { 'avgGoalsFor' => 2.0, 'avgGoalsAg' => 1.0, 'num_matches' => 20 },
        'away_away' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.2, 'num_matches' => 20 }
      }
    }
  end

  let(:league_avgs) do
    {
      'avg_goals_for' => 1.4,
      'avg_goals_ag' => 1.4,
      'avg_goals_home' => 1.6,
      'avg_goals_away' => 1.2,
      'num_teams' => 12
    }
  end

  describe '.lambdas (deterministic formula, no shrinkage when num_matches >= 15)' do
    it 'computes λ_home and λ_away exactly per the §6.1 formula' do
      out = described_class.lambdas(detail, league_avgs)

      expected_home = (2.0 / 1.4) * (1.2 / 1.4) * 1.6
      expected_away = (1.5 / 1.4) * (1.0 / 1.4) * 1.2

      expect(out[:home]).to be_within(1e-9).of(expected_home)
      expect(out[:away]).to be_within(1e-9).of(expected_away)
    end

    it 'returns positive finite lambdas' do
      out = described_class.lambdas(detail, league_avgs)
      expect(out[:home]).to be > 0
      expect(out[:away]).to be > 0
      expect(out[:home]).to be_finite
      expect(out[:away]).to be_finite
    end
  end

  describe 'conditional shrinkage (k=5, engages only when num_matches < 15)' do
    it 'does NOT shrink when num_matches >= 15 (weight ≈ 1, prior inactive)' do
      d = {
        'avgs' => {
          'home_home' => { 'avgGoalsFor' => 2.0, 'avgGoalsAg' => 1.0, 'num_matches' => 30 },
          'away_away' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.2, 'num_matches' => 30 }
        }
      }
      out = described_class.lambdas(d, league_avgs)
      # identical to the no-shrink expected value
      expect(out[:home]).to be_within(1e-9).of((2.0 / 1.4) * (1.2 / 1.4) * 1.6)
    end

    it 'shrinks the team rate toward the league mean when num_matches < 15' do
      low = {
        'avgs' => {
          'home_home' => { 'avgGoalsFor' => 4.0, 'avgGoalsAg' => 1.0, 'num_matches' => 3 },
          'away_away' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.2, 'num_matches' => 30 }
        }
      }
      shrunk = described_class.lambdas(low, league_avgs)

      not_shrunk = {
        'avgs' => {
          'home_home' => { 'avgGoalsFor' => 4.0, 'avgGoalsAg' => 1.0, 'num_matches' => 30 },
          'away_away' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.2, 'num_matches' => 30 }
        }
      }
      raw = described_class.lambdas(not_shrunk, league_avgs)

      # With n=3, w = 3/(3+5) = 0.375. The shrunk avgGoalsFor (=4.0, well above
      # the league 1.4) must be pulled DOWN toward the league mean, so λ_home
      # is strictly smaller than the un-shrunk version.
      expect(shrunk[:home]).to be < raw[:home]
      expect(shrunk[:home]).to be > 0
    end

    it 'applies w = num_matches/(num_matches+5) to the team avg vs league avg' do
      low = {
        'avgs' => {
          'home_home' => { 'avgGoalsFor' => 3.0, 'avgGoalsAg' => 1.4, 'num_matches' => 5 },
          'away_away' => { 'avgGoalsFor' => 1.4, 'avgGoalsAg' => 1.4, 'num_matches' => 30 }
        }
      }
      out = described_class.lambdas(low, league_avgs)
      w = 5.0 / (5.0 + 5.0) # = 0.5
      shrunk_for = (w * 3.0) + ((1 - w) * 1.4) # team avgGoalsFor shrunk to league avg_goals_for
      # away_away.avgGoalsAg = 1.4 with num_matches=30 ⇒ NOT shrunk.
      expected_home = (shrunk_for / 1.4) * (1.4 / 1.4) * 1.6
      expect(out[:home]).to be_within(1e-9).of(expected_home)
    end
  end

  describe 'degradation' do
    it 'returns nil when avgs block is missing/insufficient' do
      expect(described_class.lambdas({}, league_avgs)).to be_nil
      expect(described_class.lambdas({ 'avgs' => {} }, league_avgs)).to be_nil
    end

    it 'returns nil when league_avgs has zero divisors' do
      bad = { 'avg_goals_for' => 0.0, 'avg_goals_ag' => 1.4, 'avg_goals_home' => 1.6, 'avg_goals_away' => 1.2 }
      expect(described_class.lambdas(detail, bad)).to be_nil
    end
  end
end
