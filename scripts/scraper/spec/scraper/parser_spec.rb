require 'date'
require_relative '../../lib/scraper/parser'
require_relative '../../lib/scraper/fixture'

RSpec.describe AdamStats::Scraper::Parser do
  FIXTURES_DIR = File.expand_path('fixtures', __dir__)

  def load_fixture(name)
    File.read(File.join(FIXTURES_DIR, name))
  end

  describe '.parse_fixtures_list (happy path)' do
    let(:html) { load_fixture('adamchoi-fixtures-sample.html') }
    let(:result) { described_class.parse_fixtures_list(html) }

    it 'returns an array of Fixture objects' do
      expect(result).to be_an(Array)
      expect(result).not_to be_empty
      expect(result.first).to be_a(AdamStats::Scraper::Fixture)
    end

    it 'extracts at least 100 fixtures from the real snapshot' do
      expect(result.size).to be >= 100
    end

    it 'populates home_team, away_team, ko_time and source_url' do
      fixture = result.first
      expect(fixture.home_team).to be_a(String).and(satisfy { |s| !s.strip.empty? })
      expect(fixture.away_team).to be_a(String).and(satisfy { |s| !s.strip.empty? })
      expect(fixture.ko_time).to match(/\A\d{2}:\d{2}\z/)
      expect(fixture.source_url).to match(%r{/fixture/\d+})
    end

    it 'isolates ko_time without odds inline (e.g. "20:00" not "20:00 1.70")' do
      result.first(20).each do |f|
        expect(f.ko_time).to match(/\A\d{2}:\d{2}\z/),
          "expected clean HH:MM but got #{f.ko_time.inspect}"
      end
    end

    it 'populates league name for each fixture' do
      with_league = result.count { |f| f.league && !f.league.empty? }
      expect(with_league).to be >= (result.size * 0.9).to_i
    end

    it 'populates match_date as a Date' do
      expect(result.first.match_date).to be_a(Date)
    end

    it 'covers multiple dates (today + future days)' do
      uniq_dates = result.map(&:match_date).uniq
      expect(uniq_dates.size).to be >= 2
    end

    it 'is idempotent — parsing twice gives the same result' do
      first_run = described_class.parse_fixtures_list(html)
      second_run = described_class.parse_fixtures_list(html)
      expect(first_run.map(&:to_h)).to eq(second_run.map(&:to_h))
    end
  end

  describe '.parse_fixtures_list — country extraction' do
    let(:html) { load_fixture('adamchoi-fixtures-sample.html') }
    let(:result) { described_class.parse_fixtures_list(html) }

    it 'populates country from the source_url slug' do
      fixture = result.find { |f| f.source_url.to_s.include?('england-premier-league') }
      expect(fixture).not_to be_nil
      expect(fixture.country).to eq('england')
    end

    it 'extracts country as lowercase slug for all major leagues' do
      by_country = result.group_by(&:country)
      expect(by_country.keys).to include('england', 'spain', 'italy', 'portugal')
    end

    it 'country is nil when source_url is absent' do
      stub_fixture = AdamStats::Scraper::Fixture.new(
        match_date: Date.today,
        ko_time: '20:00',
        home_team: 'A',
        away_team: 'B',
        league: 'Test',
        source_url: nil,
        country: nil
      )
      expect(stub_fixture.country).to be_nil
    end

    it 'two fixtures with same league but different country have distinct countries' do
      england_pl = result.find { |f| f.source_url.to_s.include?('england-premier-league') }
      russia_pl  = result.find { |f| f.source_url.to_s.include?('russia-premier-league') }
      expect(england_pl).not_to be_nil
      expect(russia_pl).not_to be_nil
      expect(england_pl.country).not_to eq(russia_pl.country)
    end
  end

  describe '.parse_fixtures_list (edge cases)' do
    it 'returns [] for a doc with no fixture rows' do
      html = load_fixture('adamchoi-fixtures-empty.html')
      expect(described_class.parse_fixtures_list(html)).to eq([])
    end

    it 'returns [] for completely empty string' do
      expect(described_class.parse_fixtures_list('')).to eq([])
    end

    it 'raises ParseError on severely malformed HTML' do
      html = load_fixture('adamchoi-fixtures-malformed.html')
      expect {
        described_class.parse_fixtures_list(html)
      }.to raise_error(AdamStats::Scraper::ParseError)
    end
  end
end
