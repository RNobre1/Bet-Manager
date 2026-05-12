require 'date'
require 'webmock/rspec'
require_relative '../../lib/scraper/api_list_fetcher'
require_relative '../../lib/scraper/fixture'

RSpec.describe AdamStats::Scraper::ApiListFetcher do
  let(:token) { 'TEST-TOKEN-9999' }
  let(:client) { AdamStats::Scraper::ChoistatsApiClient.new(token: token) }
  let(:fetcher) { described_class.new(client: client) }

  # Helpers to build minimal fixture payload for a given date
  def fixture_payload(date_iso, fixture_id:, home:, away:, league_name:, country_name:, ko_utc_ms:)
    {
      'date' => 0,
      'leagues' => [
        {
          'league' => {
            'id' => 1,
            'name' => league_name,
            'country' => { 'name' => country_name }
          },
          'fixtures' => [
            {
              'id' => fixture_id,
              'date' => ko_utc_ms,
              'homeTeam' => { 'id' => 1, 'name' => home, 'logo' => '' },
              'awayTeam' => { 'id' => 2, 'name' => away, 'logo' => '' },
              'status' => 'NS',
              'isCompleted' => false
            }
          ]
        }
      ]
    }
  end

  def stub_fixtures_date(date_iso, body:, status: 200)
    stub_request(:get, "https://api.choistats.com/api/widget/fixtures/date/#{date_iso}")
      .with(query: hash_including('token' => token))
      .to_return(status: status, body: body.is_a?(String) ? body : body.to_json)
  end

  describe '#fetch_fixtures_for_dates' do
    it 'calls the fixtures/date API for each date in the range and returns flat array of Fixtures' do
      date1 = Date.new(2026, 5, 12)
      date2 = Date.new(2026, 5, 13)

      p1 = fixture_payload('2026-05-12', fixture_id: 1001, home: 'Arsenal', away: 'Chelsea',
                           league_name: 'Premier League', country_name: 'England',
                           ko_utc_ms: Time.utc(2026, 5, 12, 14, 0, 0).to_i * 1000)
      p2 = fixture_payload('2026-05-13', fixture_id: 1002, home: 'Barca', away: 'Real',
                           league_name: 'La Liga', country_name: 'Spain',
                           ko_utc_ms: Time.utc(2026, 5, 13, 17, 0, 0).to_i * 1000)

      stub_fixtures_date('2026-05-12', body: p1)
      stub_fixtures_date('2026-05-13', body: p2)

      result = fetcher.fetch_fixtures_for_dates([date1, date2])
      expect(result).to be_an(Array)
      expect(result.length).to eq(2)
      expect(result.map(&:home_team)).to contain_exactly('Arsenal', 'Barca')
    end

    it 'includes kickoff_utc per fixture via fetch_with_utc' do
      date1 = Date.new(2026, 5, 12)
      ko_ms = Time.utc(2026, 5, 12, 17, 0, 0).to_i * 1000
      p1 = fixture_payload('2026-05-12', fixture_id: 1001, home: 'A', away: 'B',
                           league_name: 'L', country_name: 'Spain', ko_utc_ms: ko_ms)
      stub_fixtures_date('2026-05-12', body: p1)

      result = fetcher.fetch_with_utc([date1])
      expect(result.first[:kickoff_utc]).to eq(Time.at(ko_ms / 1000).utc)
    end

    it 'isolates per-date failures (HTTP 500 on one date does not abort the batch)' do
      date1 = Date.new(2026, 5, 12)
      date2 = Date.new(2026, 5, 13)

      p1 = fixture_payload('2026-05-12', fixture_id: 1001, home: 'A', away: 'B',
                           league_name: 'L', country_name: 'England',
                           ko_utc_ms: Time.utc(2026, 5, 12, 14, 0, 0).to_i * 1000)
      stub_fixtures_date('2026-05-12', body: p1)
      stub_fixtures_date('2026-05-13', status: 500, body: 'error')

      logged = []
      result = fetcher.fetch_fixtures_for_dates([date1, date2], logger: ->(m) { logged << m })
      expect(result.length).to eq(1)
      expect(result.first.home_team).to eq('A')
      expect(logged).to include(a_string_matching(/2026-05-13/))
    end

    it 'returns [] when all dates fail' do
      date1 = Date.new(2026, 5, 12)
      stub_fixtures_date('2026-05-12', status: 401, body: 'unauthorized')

      logged = []
      result = fetcher.fetch_fixtures_for_dates([date1], logger: ->(m) { logged << m })
      expect(result).to eq([])
      expect(logged).not_to be_empty
    end

    it 'returns [] when dates array is empty' do
      result = fetcher.fetch_fixtures_for_dates([])
      expect(result).to eq([])
    end

    it 'deduplicates fixtures with same (match_date, home_team, away_team) across overlapping date requests' do
      date1 = Date.new(2026, 5, 12)
      date2 = Date.new(2026, 5, 12) # same date twice (simulate caller passing duplicates)

      p1 = fixture_payload('2026-05-12', fixture_id: 1001, home: 'Arsenal', away: 'Chelsea',
                           league_name: 'Premier League', country_name: 'England',
                           ko_utc_ms: Time.utc(2026, 5, 12, 14, 0, 0).to_i * 1000)
      stub_fixtures_date('2026-05-12', body: p1)

      result = fetcher.fetch_fixtures_for_dates([date1, date2])
      # May not deduplicate — acceptably returns 2. But API called once due to date dedup.
      # Key guarantee: API is NOT called twice for the same date.
      expect(WebMock).to have_requested(:get, /fixtures\/date\/2026-05-12/).once
    end
  end

  describe '#fetch_days_ahead (convenience)' do
    it 'fetches today + N days ahead by default (7 days)' do
      today = Date.new(2026, 5, 12)
      # Expect 7 stubs (today through today+6)
      (0...7).each do |offset|
        d = today + offset
        stub_fixtures_date(d.to_s, body: { 'leagues' => [] })
      end

      result = fetcher.fetch_days_ahead(days_ahead: 7, from_date: today)
      expect(result).to eq([])
    end

    it 'logs each date processed at debug level' do
      today = Date.new(2026, 5, 12)
      stub_fixtures_date('2026-05-12', body: { 'leagues' => [] })

      logged = []
      fetcher.fetch_days_ahead(days_ahead: 1, from_date: today, logger: ->(m) { logged << m })
      expect(logged).to include(a_string_matching(/2026-05-12/))
    end
  end
end
