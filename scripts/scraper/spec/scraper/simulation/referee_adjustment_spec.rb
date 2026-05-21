require 'json'
require_relative '../../../lib/scraper/simulation/runner'
require_relative '../../../lib/scraper/widget_merger'
require_relative '../../../lib/scraper/match_detail'

# F6 — Referee record (avg_*_booking_points) couples to the card-rate λ as
# a relative, clamped, blended adjustment over the team baseline:
#
#   mult     = clamp(ref_side_bp / LEAGUE_AVG_BOOKING_POINTS_PER_SIDE, 0.5, 2.0)
#   mean_adj = mean_team * (1 + (mult - 1) * 0.4)
#
# Degradation (Lição #11 — honest, never raise):
#   referee_record absent OR side-specific field missing/non-positive ⇒
#   preserve the team's mean (current pre-F6 behaviour).
#
# This spec exercises the private helper `apply_referee_adjustment` directly
# via `send` because the card `mean` is NOT persisted scalar-side — it's
# consumed by the Monte Carlo NB sampler and only `p10/p50/p90` of the draw
# survive into `sim_stats`. Testing the helper is deterministic AND mirrors
# the mathematical contract one-to-one. End-to-end coverage of "referee
# affects sim_stats.cards" follows by construction (mean flows through
# `secondary[:cards][:home][:mean]` to `SecondaryStats.sample`).
RSpec.describe AdamStats::Scraper::Simulation::Runner do
  let(:runner) { described_class }

  BASELINE = AdamStats::Scraper::Simulation::Runner::LEAGUE_AVG_BOOKING_POINTS_PER_SIDE
  WEIGHT   = AdamStats::Scraper::Simulation::Runner::REFEREE_WEIGHT
  MULT_MIN = AdamStats::Scraper::Simulation::Runner::REFEREE_MULT_MIN
  MULT_MAX = AdamStats::Scraper::Simulation::Runner::REFEREE_MULT_MAX

  def expected_adjusted(mean, side_bp)
    raw_mult = side_bp / BASELINE
    mult = [[raw_mult, MULT_MIN].max, MULT_MAX].min
    mean * (1 + (mult - 1) * WEIGHT)
  end

  describe 'MODEL_VERSION bump' do
    it 'is at least sim-v1-poisson-dc-nb-mc10k-v3 (F6 referee coupling shipped)' do
      # v3 ⇒ F6 (referee). v4 ⇒ F10 (anytime_scorer blend). Both downstream
      # bumps preserve the F6 contract; this spec just guards the floor.
      expect(runner::MODEL_VERSION).to match(/\Asim-v1-poisson-dc-nb-mc10k-v[3-9]\z/)
    end
  end

  describe '.apply_referee_adjustment (private helper)' do
    let(:mean) { 30.0 } # representative team booking-points mean

    context 'when referee_record is nil' do
      it 'preserves the team mean (degrades gracefully)' do
        out = runner.send(:apply_referee_adjustment, mean, nil, 'avg_home_booking_points')
        expect(out).to eq(mean)
      end
    end

    context 'when referee_record is not a Hash' do
      it 'preserves the team mean' do
        out = runner.send(:apply_referee_adjustment, mean, 'garbage', 'avg_home_booking_points')
        expect(out).to eq(mean)
      end
    end

    context 'when the side-specific field is missing' do
      it 'preserves the team mean' do
        ref = { 'avg_away_booking_points' => 25.0 } # only the OTHER side present
        out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expect(out).to eq(mean)
      end
    end

    context 'when the side-specific field is zero or non-positive' do
      it 'preserves the team mean (no division-by-zero risk on the multiplier)' do
        ref = { 'avg_home_booking_points' => 0 }
        out_zero = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expect(out_zero).to eq(mean)

        ref_neg = { 'avg_home_booking_points' => -5 }
        out_neg = runner.send(:apply_referee_adjustment, mean, ref_neg, 'avg_home_booking_points')
        expect(out_neg).to eq(mean)
      end
    end

    context 'when referee is strict (booking points above baseline)' do
      it 'increases the mean per the clamped, blended formula' do
        ref = { 'avg_home_booking_points' => 35.0 }
        # 35 / 22.5 ≈ 1.555 → blend 60/40 ⇒ ~1.222× team mean
        out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expect(out).to be > mean
        expect(out).to be_within(1e-9).of(expected_adjusted(mean, 35.0))
      end
    end

    context 'when referee is lenient (booking points below baseline)' do
      it 'decreases the mean per the clamped, blended formula' do
        ref = { 'avg_home_booking_points' => 12.0 }
        # 12 / 22.5 ≈ 0.533 → blend 60/40 ⇒ ~0.813× team mean
        out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expect(out).to be < mean
        expect(out).to be_within(1e-9).of(expected_adjusted(mean, 12.0))
      end
    end

    context 'clamps protect from outlier referee samples' do
      it 'caps the multiplier at MULT_MAX (= 2.0) so a 100 bp ref blends to 1.4× mean' do
        ref = { 'avg_home_booking_points' => 100.0 }
        out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expected_factor = 1 + (MULT_MAX - 1) * WEIGHT # = 1.4
        expect(out).to be_within(1e-9).of(mean * expected_factor)
      end

      it 'floors the multiplier at MULT_MIN (= 0.5) so a 1 bp ref blends to 0.8× mean' do
        ref = { 'avg_home_booking_points' => 1.0 }
        out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        expected_factor = 1 + (MULT_MIN - 1) * WEIGHT # = 0.8
        expect(out).to be_within(1e-9).of(mean * expected_factor)
      end
    end

    context 'side-awareness' do
      it 'uses avg_home_booking_points for home only, avg_away_booking_points for away only' do
        ref = {
          'avg_home_booking_points' => 30.0, # strict at home
          'avg_away_booking_points' => 15.0  # lenient away
        }
        home_out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_home_booking_points')
        away_out = runner.send(:apply_referee_adjustment, mean, ref, 'avg_away_booking_points')
        expect(home_out).to be_within(1e-9).of(expected_adjusted(mean, 30.0))
        expect(away_out).to be_within(1e-9).of(expected_adjusted(mean, 15.0))
        expect(home_out).to be > away_out # strict raises; lenient lowers
      end
    end
  end

  # End-to-end: a strict referee must produce a higher central card draw
  # (`sim_stats.cards.{home,away}.p50`) than the same fixture without a
  # referee. Single broad sanity check; the math is fully nailed above.
  describe 'end-to-end through .simulate' do
    def enriched_detail
      base = AdamStats::Scraper::MatchDetail.empty
      widgets = {
        recent_results: JSON.parse(File.read(fixture_path('recent-results.json'))),
        players: JSON.parse(File.read(fixture_path('players.json'))),
        odds: JSON.parse(File.read(fixture_path('odds.json'))),
        team_records: JSON.parse(File.read(fixture_path('team-records.json')))
      }
      merged = AdamStats::Scraper::WidgetMerger.merge(base, widgets).to_h
      JSON.parse(JSON.generate(merged))
    end

    def fixture_path(name)
      File.expand_path("../fixtures/widgets/#{name}", __dir__)
    end

    def card_p50s(detail)
      out = described_class.simulate(detail)
      stats = out[:sim_stats] || {}
      home_cards = stats.dig(:home, :cards) || {}
      away_cards = stats.dig(:away, :cards) || {}
      { home: home_cards[:p50], away: away_cards[:p50] }
    end

    it 'a strict referee shifts the persisted card central tendency upward' do
      base = enriched_detail
      strict = enriched_detail
      strict['referee_record'] = {
        'name' => 'Strict Whistle',
        'avg_home_booking_points' => 40.0,
        'avg_away_booking_points' => 40.0
      }

      base_p50    = card_p50s(base)
      strict_p50  = card_p50s(strict)

      # Discrete NB draws can tie at small means; require strictly greater OR
      # equal — but at least one side should move (40 / 22.5 ≈ 1.78 → factor
      # ≈ 1.31, ≥ 30% lift on mean, big enough to register on p50).
      expect(strict_p50[:home]).to be >= base_p50[:home]
      expect(strict_p50[:away]).to be >= base_p50[:away]
      expect(strict_p50[:home] + strict_p50[:away])
        .to be > base_p50[:home] + base_p50[:away]
    end
  end
end
