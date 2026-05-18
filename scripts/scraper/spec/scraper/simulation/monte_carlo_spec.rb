require_relative '../../../lib/scraper/simulation/monte_carlo'

RSpec.describe AdamStats::Scraper::Simulation::MonteCarlo do
  # Minimal deterministic inputs. lambda_home/away drive the score model;
  # secondary_means / secondary_dispersions drive the NB stats; players drive
  # the per-player allocation.
  def base_args(n: 4000)
    {
      seed: 12_345,
      n: n,
      lambda_home: 1.6,
      lambda_away: 1.1,
      rho: -0.10,
      secondary: {
        corners: {
          home: { mean: 5.5, dispersion: 3.0, mean_1h: 2.4, mean_2h: 3.1 },
          away: { mean: 4.2, dispersion: 2.5, mean_1h: 1.8, mean_2h: 2.4 }
        },
        cards: {
          home: { mean: 1.9, dispersion: 1.5 },
          away: { mean: 2.1, dispersion: 1.6 }
        }
      },
      per_half_available: true,
      market_anchor: { 'Result' => { 'Home' => 0.55, 'Draw' => 0.25, 'Away' => 0.20 } },
      players: {
        home: { xi: [{ 'name' => 'H1', 'goals' => 10, 'minutes' => 2000, 'yellows' => 3, 'reds' => 0, 'shots_on_target' => 20 }],
                confidence: :high },
        away: { xi: [{ 'name' => 'A1', 'goals' => 5, 'minutes' => 1800, 'yellows' => 5, 'reds' => 1, 'shots_on_target' => 12 }],
                confidence: :med }
      }
    }
  end

  describe '.run output contract (scalars only)' do
    let(:out) { described_class.run(**base_args) }

    it 'returns 1X2 probabilities that sum to ≈ 1.0' do
      expect(out[:p_home] + out[:p_draw] + out[:p_away]).to be_within(1e-6).of(1.0)
      [out[:p_home], out[:p_draw], out[:p_away]].each { |p| expect(p).to be_between(0.0, 1.0) }
    end

    it 'returns p_btts and p_over_25 in [0,1]' do
      expect(out[:p_btts]).to be_between(0.0, 1.0)
      expect(out[:p_over_25]).to be_between(0.0, 1.0)
    end

    it 'returns at most 6 top_scorelines, each a {score:, prob:} scalar' do
      expect(out[:top_scorelines].length).to be <= 6
      out[:top_scorelines].each do |s|
        expect(s[:score]).to match(/\A\d+-\d+\z/)
        expect(s[:prob]).to be_between(0.0, 1.0)
      end
    end

    it 'returns sim_stats with p10/p50/p90 per metric/team' do
      ch = out[:sim_stats][:corners]
      expect(ch[:home].keys).to include(:p10, :p50, :p90)
      expect(ch[:home][:p10]).to be <= ch[:home][:p50]
      expect(ch[:home][:p50]).to be <= ch[:home][:p90]
    end

    it 'exposes per-half corners only when per_half_available' do
      expect(out[:per_half_available]).to be(true)
      expect(out[:sim_stats][:corners][:home]).to have_key(:p50_1h)
      expect(out[:sim_stats][:corners][:home]).to have_key(:p50_2h)
    end

    it 'echoes market_anchor unchanged (validation only, never an input)' do
      expect(out[:market_anchor]).to eq('Result' => { 'Home' => 0.55, 'Draw' => 0.25, 'Away' => 0.20 })
    end

    it 'returns player_events with P(goal)/expected goals/P(card)/P(SOT) + flags' do
      ev = out[:player_events].find { |e| e[:name] == 'H1' }
      expect(ev).not_to be_nil
      expect(ev[:p_goal]).to be_between(0.0, 1.0)
      expect(ev[:expected_goals]).to be >= 0.0
      expect(ev[:p_card]).to be_between(0.0, 1.0)
      expect(ev[:p_sot]).to be_between(0.0, 1.0)
      expect([true, false]).to include(ev[:provavel_titular])
      expect(%i[low med high]).to include(ev[:confidence])
    end

    it 'output is 100% scalar (no nested arrays of raw iterations)' do
      json = JSON.generate(out)
      expect(json.bytesize).to be < 20_000 # tiny scalar payload, never the raw blob
    end
  end

  describe 'reproducibility' do
    it 'same seed ⇒ identical output' do
      a = described_class.run(**base_args)
      b = described_class.run(**base_args)
      expect(a).to eq(b)
    end

    it 'different seed ⇒ (very likely) different probabilities' do
      a = described_class.run(**base_args.merge(seed: 1))
      b = described_class.run(**base_args.merge(seed: 999_999))
      expect(a[:p_home]).not_to eq(b[:p_home])
    end
  end

  describe 'degradation' do
    it 'omits per-half keys when per_half_available is false' do
      out = described_class.run(**base_args.merge(per_half_available: false))
      expect(out[:per_half_available]).to be(false)
      expect(out[:sim_stats][:corners][:home]).not_to have_key(:p50_1h)
    end
  end
end
