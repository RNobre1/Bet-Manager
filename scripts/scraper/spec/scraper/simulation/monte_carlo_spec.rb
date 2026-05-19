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

    it 'structures sim_stats as side→metric (consumer contract)' do
      expect(out[:sim_stats].keys).to include(:home, :away)
      expect(out[:sim_stats][:home].keys).to include(:goals, :corners, :cards)
      expect(out[:sim_stats][:away].keys).to include(:goals, :corners, :cards)
    end

    it 'returns sim_stats with p10/p50/p90 per team/metric' do
      ch = out[:sim_stats][:home][:corners]
      expect(ch.keys).to include(:p10, :p50, :p90)
      expect(ch[:p10]).to be <= ch[:p50]
      expect(ch[:p50]).to be <= ch[:p90]
    end

    it 'derives a goals metric per side from the scoreline draws' do
      %i[home away].each do |side|
        g = out[:sim_stats][side][:goals]
        expect(g.keys).to include(:p10, :p50, :p90)
        expect(g[:p10]).to be >= 0
        expect(g[:p10]).to be <= g[:p50]
        expect(g[:p50]).to be <= g[:p90]
      end
    end

    it 'exposes per-half corners only when per_half_available' do
      expect(out[:per_half_available]).to be(true)
      expect(out[:sim_stats][:home][:corners]).to have_key(:p50_1h)
      expect(out[:sim_stats][:home][:corners]).to have_key(:p50_2h)
    end

    it 'keeps goals full-match only (score model has no honest half split)' do
      expect(out[:per_half_available]).to be(true)
      expect(out[:sim_stats][:home][:goals]).not_to have_key(:p50_1h)
      expect(out[:sim_stats][:away][:goals]).not_to have_key(:p50_1h)
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

  describe 'symbol-keyed players (real WidgetMerger#flatten_player shape)' do
    # The in-memory producer (WidgetMerger#flatten_player) builds players with
    # SYMBOL keys. Regression for the prod bug where player_events collapsed
    # into a SINGLE empty `name:""` all-zero entry because init/aggregate read
    # string-only `p['name']` while allocate used the tolerant accessor.
    def symbol_keyed_args(n: 6000)
      base_args(n: n).merge(
        players: {
          home: {
            xi: [
              { name: 'Saka', started: 30, minutes: 2400, goals: 18, yellows: 2, reds: 0, shots_on_target: 60, injured: false },
              { name: 'Ødegaard', started: 28, minutes: 2300, goals: 12, yellows: 3, reds: 0, shots_on_target: 45, injured: false },
              { name: 'Saliba', started: 29, minutes: 2500, goals: 3, yellows: 4, reds: 0, shots_on_target: 15, injured: false }
            ],
            confidence: :high
          },
          away: {
            xi: [
              { name: 'Foden', started: 27, minutes: 2200, goals: 14, yellows: 2, reds: 0, shots_on_target: 50, injured: false },
              { name: 'Haaland', started: 30, minutes: 2600, goals: 28, yellows: 1, reds: 0, shots_on_target: 80, injured: false }
            ],
            confidence: :med
          }
        }
      )
    end

    let(:out) { described_class.run(**symbol_keyed_args) }
    let(:events) { out[:player_events] }

    it 'emits one entry per distinct XI player (NOT a single empty entry)' do
      expect(events.length).to eq(5)
      names = events.map { |e| e[:name] }
      expect(names).to match_array(%w[Saka Ødegaard Saliba Foden Haaland])
      expect(names).not_to include('')
    end

    it 'keys every entry by the real player name (non-empty)' do
      events.each do |e|
        expect(e[:name]).to be_a(String)
        expect(e[:name]).not_to be_empty
      end
    end

    it 'actually allocates/accumulates goals (acc keys agree across init/allocate/aggregate)' do
      scorers = events.select { |e| e[:expected_goals].positive? && e[:p_goal].positive? }
      expect(scorers).not_to be_empty
      haaland = events.find { |e| e[:name] == 'Haaland' }
      expect(haaland[:expected_goals]).to be > 0.0
      expect(haaland[:p_goal]).to be > 0.0
    end

    it 'populates provavel_titular and confidence per player' do
      events.each do |e|
        expect([true, false]).to include(e[:provavel_titular])
        expect(%i[low med high]).to include(e[:confidence])
      end
      expect(events.find { |e| e[:name] == 'Saka' }[:provavel_titular]).to be(true)
      expect(events.find { |e| e[:name] == 'Saka' }[:confidence]).to eq(:high)
      expect(events.find { |e| e[:name] == 'Foden' }[:confidence]).to eq(:med)
    end
  end

  describe 'degradation' do
    it 'omits per-half keys when per_half_available is false' do
      out = described_class.run(**base_args.merge(per_half_available: false))
      expect(out[:per_half_available]).to be(false)
      expect(out[:sim_stats][:home][:corners]).not_to have_key(:p50_1h)
    end
  end
end
