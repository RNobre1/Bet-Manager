require 'date'
require 'time'
require_relative '../../lib/scraper/list_api_parser'
require_relative '../../lib/scraper/fixture'

RSpec.describe AdamStats::Scraper::ListApiParser do
  # Minimal API payload modelled on real response from
  # GET /api/widget/fixtures/date/2026-05-12
  let(:la_liga_payload) do
    {
      'date' => 1_778_544_000_000, # 2026-05-12 00:00 UTC
      'leagues' => [
        {
          'date' => 1_778_544_000_000,
          'league' => {
            'id' => 564,
            'name' => 'La Liga',
            'country' => { 'name' => 'Spain', 'code' => 'https://cdn/es.svg', 'flagUrl' => 'https://cdn/es.svg' }
          },
          'fixtures' => [
            {
              'id' => 19_439_600,
              'date' => 1_778_605_200_000, # 2026-05-12 17:00 UTC (18:00 BST)
              'homeTeam' => { 'id' => 36, 'name' => 'Celta de Vigo', 'logo' => 'https://cdn/celta.png' },
              'awayTeam' => { 'id' => 3457, 'name' => 'Levante', 'logo' => 'https://cdn/levante.png' },
              'seasonId' => 25_659,
              'status' => 'NS',
              'homeTeamPosition' => '6th',
              'awayTeamPosition' => '19th',
              'isCompleted' => false,
              'slug' => 'null-v-null'
            }
          ]
        }
      ]
    }
  end

  let(:premier_league_payload) do
    {
      'date' => 1_778_544_000_000,
      'leagues' => [
        {
          'date' => 1_778_544_000_000,
          'league' => {
            'id' => 1,
            'name' => 'Premier League',
            'country' => { 'name' => 'England' }
          },
          'fixtures' => [
            {
              'id' => 11111,
              'date' => 1_778_572_800_000, # 2026-05-12 10:00 UTC (11:00 BST)
              'homeTeam' => { 'id' => 1, 'name' => 'Arsenal', 'logo' => '' },
              'awayTeam' => { 'id' => 2, 'name' => 'Chelsea', 'logo' => '' },
              'seasonId' => 100,
              'status' => 'NS',
              'isCompleted' => false,
              'slug' => 'arsenal-v-chelsea'
            }
          ]
        }
      ]
    }
  end

  # Payload with missing optional fields to test robustness
  let(:minimal_fixture_payload) do
    {
      'date' => 1_778_544_000_000,
      'leagues' => [
        {
          'league' => {
            'id' => 999,
            'name' => 'Test League',
            'country' => { 'name' => 'Germany' }
          },
          'fixtures' => [
            {
              'id' => 99999,
              'date' => 1_778_544_000_000, # exactly midnight UTC (00:00 BST in BST period = still 2026-05-12 UK)
              'homeTeam' => { 'id' => 10, 'name' => 'Home FC', 'logo' => '' },
              'awayTeam' => { 'id' => 11, 'name' => 'Away FC', 'logo' => '' },
              'status' => 'NS',
              'isCompleted' => false
            }
          ]
        }
      ]
    }
  end

  describe '.parse' do
    it 'returns an Array of Fixture structs' do
      result = described_class.parse(la_liga_payload)
      expect(result).to be_an(Array)
      expect(result.first).to be_a(AdamStats::Scraper::Fixture)
    end

    it 'maps homeTeam.name and awayTeam.name correctly' do
      fixtures = described_class.parse(la_liga_payload)
      expect(fixtures.first.home_team).to eq('Celta de Vigo')
      expect(fixtures.first.away_team).to eq('Levante')
    end

    it 'maps league.name correctly' do
      fixtures = described_class.parse(la_liga_payload)
      expect(fixtures.first.league).to eq('La Liga')
    end

    it 'normalizes country to lowercase from league.country.name' do
      fixtures = described_class.parse(la_liga_payload)
      expect(fixtures.first.country).to eq('spain')
    end

    it 'normalizes multi-word country name to lowercase (no stripping needed for ASCII)' do
      fixtures = described_class.parse(premier_league_payload)
      expect(fixtures.first.country).to eq('england')
    end

    it 'sets source_url to /fixture/{id}' do
      fixtures = described_class.parse(la_liga_payload)
      expect(fixtures.first.source_url).to eq('/fixture/19439600')
    end

    it 'computes kickoff_utc from date (UTC ms) as a UTC Time — via parse_with_utc' do
      # kickoff_utc is returned by parse_with_utc, not parse.
      # See the parse_with_utc spec below.
      result = described_class.parse_with_utc(la_liga_payload)
      expect(result.first[:kickoff_utc]).to eq(Time.at(1_778_605_200).utc)
    end

    it 'returns array of hashes with :fixture and :kickoff_utc keys when parsed via parse_with_utc' do
      result = described_class.parse_with_utc(la_liga_payload)
      expect(result).to be_an(Array)
      first = result.first
      expect(first).to have_key(:fixture)
      expect(first).to have_key(:kickoff_utc)
      expect(first[:fixture]).to be_a(AdamStats::Scraper::Fixture)
      expected_utc = Time.at(1_778_605_200_000 / 1000).utc
      expect(first[:kickoff_utc]).to eq(expected_utc)
    end

    it 'derives match_date as UK date (BST during May 2026)' do
      # 1778605200 = 2026-05-12 17:00 UTC = 18:00 BST → UK date = 2026-05-12
      result = described_class.parse_with_utc(la_liga_payload)
      expect(result.first[:fixture].match_date).to eq(Date.new(2026, 5, 12))
    end

    it 'derives ko_time as UK local HH:MM (BST = UTC+1)' do
      # 17:00 UTC + 1h BST = 18:00 UK local
      result = described_class.parse_with_utc(la_liga_payload)
      expect(result.first[:fixture].ko_time).to eq('18:00')
    end

    it 'handles midnight UTC correctly: date stays same-day in BST' do
      # 1778544000 = 2026-05-12 00:00 UTC = 01:00 BST → UK date 2026-05-12
      result = described_class.parse_with_utc(minimal_fixture_payload)
      expect(result.first[:fixture].match_date).to eq(Date.new(2026, 5, 12))
      expect(result.first[:fixture].ko_time).to eq('01:00')
    end

    it 'returns [] for nil payload' do
      expect(described_class.parse(nil)).to eq([])
    end

    it 'returns [] for empty leagues array' do
      expect(described_class.parse({ 'leagues' => [] })).to eq([])
    end

    it 'returns [] for missing leagues key' do
      expect(described_class.parse({})).to eq([])
    end

    it 'handles missing country gracefully (nil country)' do
      payload = {
        'leagues' => [
          {
            'league' => { 'id' => 1, 'name' => 'Unknown League' },
            'fixtures' => [
              {
                'id' => 1,
                'date' => 1_778_605_200_000,
                'homeTeam' => { 'name' => 'A' },
                'awayTeam' => { 'name' => 'B' },
                'status' => 'NS',
                'isCompleted' => false
              }
            ]
          }
        ]
      }
      result = described_class.parse(payload)
      expect(result.first.country).to be_nil
    end

    it 'flattens fixtures from multiple leagues into a single array' do
      payload = {
        'leagues' => [
          {
            'league' => { 'id' => 1, 'name' => 'Liga A', 'country' => { 'name' => 'Spain' } },
            'fixtures' => [
              { 'id' => 1, 'date' => 1_778_605_200_000, 'homeTeam' => { 'name' => 'X' }, 'awayTeam' => { 'name' => 'Y' }, 'status' => 'NS', 'isCompleted' => false },
              { 'id' => 2, 'date' => 1_778_605_200_000, 'homeTeam' => { 'name' => 'A' }, 'awayTeam' => { 'name' => 'B' }, 'status' => 'NS', 'isCompleted' => false }
            ]
          },
          {
            'league' => { 'id' => 2, 'name' => 'Liga B', 'country' => { 'name' => 'France' } },
            'fixtures' => [
              { 'id' => 3, 'date' => 1_778_605_200_000, 'homeTeam' => { 'name' => 'P' }, 'awayTeam' => { 'name' => 'Q' }, 'status' => 'NS', 'isCompleted' => false }
            ]
          }
        ]
      }
      result = described_class.parse(payload)
      expect(result.length).to eq(3)
      expect(result.map(&:league)).to contain_exactly('Liga A', 'Liga A', 'Liga B')
    end

    it 'skips fixtures with missing homeTeam or awayTeam name' do
      payload = {
        'leagues' => [
          {
            'league' => { 'id' => 1, 'name' => 'L', 'country' => { 'name' => 'X' } },
            'fixtures' => [
              { 'id' => 1, 'date' => 1_778_605_200_000, 'homeTeam' => { 'name' => '' }, 'awayTeam' => { 'name' => 'B' }, 'status' => 'NS', 'isCompleted' => false },
              { 'id' => 2, 'date' => 1_778_605_200_000, 'homeTeam' => { 'name' => 'A' }, 'awayTeam' => { 'name' => 'B' }, 'status' => 'NS', 'isCompleted' => false }
            ]
          }
        ]
      }
      result = described_class.parse(payload)
      expect(result.length).to eq(1)
      expect(result.first.home_team).to eq('A')
    end
  end

  describe 'UTC→UK time derivation' do
    # December: GMT (UTC+0)
    it 'uses GMT (UTC+0) in winter (December)' do
      # 2026-12-15 20:00 UTC = 20:00 GMT → UK date 2026-12-15, ko_time 20:00
      ms = Time.utc(2026, 12, 15, 20, 0, 0).to_i * 1000
      payload = {
        'leagues' => [
          {
            'league' => { 'id' => 1, 'name' => 'Winter Liga', 'country' => { 'name' => 'England' } },
            'fixtures' => [
              { 'id' => 777, 'date' => ms, 'homeTeam' => { 'name' => 'Home' }, 'awayTeam' => { 'name' => 'Away' }, 'status' => 'NS', 'isCompleted' => false }
            ]
          }
        ]
      }
      result = described_class.parse_with_utc(payload)
      expect(result.first[:fixture].match_date).to eq(Date.new(2026, 12, 15))
      expect(result.first[:fixture].ko_time).to eq('20:00')
    end

    # Cross-midnight: 23:00 UTC in BST = 00:00 next day UK
    it 'rolls date forward when UTC time crosses midnight in BST' do
      # 2026-05-12 23:30 UTC = 00:30 BST on 2026-05-13
      ms = Time.utc(2026, 5, 12, 23, 30, 0).to_i * 1000
      payload = {
        'leagues' => [
          {
            'league' => { 'id' => 1, 'name' => 'Late Liga', 'country' => { 'name' => 'Brazil' } },
            'fixtures' => [
              { 'id' => 888, 'date' => ms, 'homeTeam' => { 'name' => 'Flamengo' }, 'awayTeam' => { 'name' => 'Vasco' }, 'status' => 'NS', 'isCompleted' => false }
            ]
          }
        ]
      }
      result = described_class.parse_with_utc(payload)
      expect(result.first[:fixture].match_date).to eq(Date.new(2026, 5, 13))
      expect(result.first[:fixture].ko_time).to eq('00:30')
    end
  end
end
