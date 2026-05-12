require 'json'
require_relative '../../lib/scraper/detail_parser'
require_relative '../../lib/scraper/match_detail'

RSpec.describe AdamStats::Scraper::DetailParser do
  FIXTURES_DIR = File.expand_path('fixtures', __dir__)

  def load_fixture(name)
    File.read(File.join(FIXTURES_DIR, name))
  end

  describe '.parse_detail (happy path with real snapshot)' do
    let(:html) { load_fixture('adamchoi-detail-sample.html') }
    let(:result) { described_class.parse_detail(html) }

    it 'returns a MatchDetail value object' do
      expect(result).to be_a(AdamStats::Scraper::MatchDetail)
    end

    it 'extracts trends as a non-empty array of stat entries' do
      expect(result.trends).to be_an(Array)
      expect(result.trends).not_to be_empty
    end

    it 'each trend has label, home percent and away percent' do
      first = result.trends.first
      expect(first[:label]).to be_a(String).and(satisfy { |s| !s.strip.empty? })
      expect(first[:home_percent]).to be_a(Integer)
      expect(first[:away_percent]).to be_a(Integer)
    end

    it 'each trend exposes the ratio (X/Y) for sample-size context' do
      first = result.trends.first
      expect(first[:home_ratio]).to match(%r{\A\d+/\d+\z})
      expect(first[:away_ratio]).to match(%r{\A\d+/\d+\z})
    end

    it 'each trend also includes "recent" stats (home at home, away as away)' do
      first = result.trends.first
      expect(first[:home_recent_percent]).to be_a(Integer)
      expect(first[:home_recent_ratio]).to match(%r{\A\d+/\d+\z})
      expect(first[:away_recent_percent]).to be_a(Integer)
      expect(first[:away_recent_ratio]).to match(%r{\A\d+/\d+\z})
    end

    it 'recent ratio sample is smaller than overall ratio (only home/away games)' do
      first = result.trends.first
      overall_total = first[:home_ratio].split('/').last.to_i
      recent_total = first[:home_recent_ratio].split('/').last.to_i
      expect(recent_total).to be < overall_total
    end

    it 'includes "Over 25 Booking Points" label (sanity check against the snapshot)' do
      labels = result.trends.map { |t| t[:label] }
      expect(labels).to include('Over 25 Booking Points')
    end

    it 'each trend percent is between 0 and 100' do
      result.trends.first(10).each do |t|
        expect(t[:home_percent]).to be_between(0, 100)
        expect(t[:away_percent]).to be_between(0, 100)
      end
    end

    it 'recent_matches is a Hash with :home and :away keys' do
      expect(result.recent_matches).to be_a(Hash)
      expect(result.recent_matches).to have_key(:home)
      expect(result.recent_matches).to have_key(:away)
    end

    it 'h2h is an Array (possibly empty when lazy-loaded section is absent)' do
      expect(result.h2h).to be_an(Array)
    end

    it 'streaks is a Hash with :home and :away arrays' do
      expect(result.streaks).to be_a(Hash)
      expect(result.streaks[:home]).to be_an(Array)
      expect(result.streaks[:away]).to be_an(Array)
    end

    it 'serializes to JSON without errors (Postgres jsonb compatibility)' do
      expect { JSON.generate(result.to_h) }.not_to raise_error
    end

    it 'is idempotent — parsing twice gives the same result' do
      first_run = described_class.parse_detail(html).to_h
      second_run = described_class.parse_detail(html).to_h
      expect(first_run).to eq(second_run)
    end
  end

  describe '.parse_detail (edge cases)' do
    it 'returns a MatchDetail with empty fields for HTML without stats' do
      html = load_fixture('adamchoi-detail-empty.html')
      result = described_class.parse_detail(html)
      expect(result).to be_a(AdamStats::Scraper::MatchDetail)
      expect(result.trends).to eq([])
      expect(result.recent_matches).to eq(home: [], away: [])
      expect(result.h2h).to eq([])
      expect(result.streaks).to eq(home: [], away: [])
    end

    it 'returns an empty MatchDetail for empty input' do
      result = described_class.parse_detail('')
      expect(result.trends).to eq([])
      expect(result.recent_matches).to eq(home: [], away: [])
    end

    it 'returns an empty MatchDetail for nil input' do
      result = described_class.parse_detail(nil)
      expect(result.trends).to eq([])
    end
  end
end
