require 'webmock/rspec'
require_relative '../../lib/scraper/choistats_api_client'

RSpec.describe AdamStats::Scraper::ChoistatsApiClient do
  let(:token) { 'TEST-TOKEN-1234' }
  let(:client) { described_class.new(token: token) }
  let(:fixture_id) { 19618110 }

  def stub_widget(path, body: { ok: true }, status: 200, headers: {})
    stub_request(:get, "https://api.choistats.com/api/widget/#{path}")
      .with(query: hash_including('token' => token))
      .to_return(status: status, body: body.is_a?(String) ? body : body.to_json, headers: headers)
  end

  describe '#fetch_widget' do
    it 'GETs the match endpoint with the configured token and required headers' do
      stub = stub_request(:get, %r{api\.choistats\.com/api/widget/match/#{fixture_id}/players})
        .with(
          query: hash_including('token' => token, 'clflc' => 'abc', 'isOverall' => 'true'),
          headers: { 'X-Adamchoi-Api-Token' => token, 'Referer' => 'https://www.adamchoi.co.uk/' }
        )
        .to_return(status: 200, body: { homePlayers: [], awayPlayers: [] }.to_json)

      result = client.fetch_widget(:players, fixture_id: fixture_id)
      expect(result).to eq('homePlayers' => [], 'awayPlayers' => [])
      expect(stub).to have_been_requested
    end

    it 'maps :recent_results, :team_records, :players, :chances and :odds to the right path' do
      stub_widget("match/#{fixture_id}/recent-results")
      stub_widget("match/#{fixture_id}/team-records")
      stub_widget("match/#{fixture_id}/players")
      stub_widget("chances/fixture/#{fixture_id}")
      stub_widget("match/#{fixture_id}/odds")

      %i[recent_results team_records players chances odds].each do |kind|
        expect { client.fetch_widget(kind, fixture_id: fixture_id) }.not_to raise_error
      end
    end

    it 'raises a domain error on HTTP 401' do
      stub_widget("match/#{fixture_id}/players", status: 401, body: 'unauthorized')
      expect { client.fetch_widget(:players, fixture_id: fixture_id) }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::AuthError)
    end

    it 'raises a domain error on HTTP 5xx' do
      stub_widget("match/#{fixture_id}/players", status: 503, body: 'down')
      expect { client.fetch_widget(:players, fixture_id: fixture_id) }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::ServerError)
    end

    it 'raises a domain error on HTTP 429 (rate limited)' do
      stub_widget("match/#{fixture_id}/players", status: 429, body: 'slow down', headers: { 'Retry-After' => '7' })
      expect { client.fetch_widget(:players, fixture_id: fixture_id) }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::RateLimitError) { |e|
          expect(e.retry_after).to eq(7)
        }
    end

    it 'raises an unknown widget error for unsupported kinds' do
      expect { client.fetch_widget(:players_v2, fixture_id: fixture_id) }
        .to raise_error(ArgumentError, /unknown widget/)
    end
  end

  describe '#fetch_all' do
    it 'returns a hash with the 5 canonical widget keys when all succeed' do
      stub_widget("match/#{fixture_id}/recent-results", body: { recents: true })
      stub_widget("match/#{fixture_id}/team-records", body: { records: true })
      stub_widget("match/#{fixture_id}/players", body: { players: true })
      stub_widget("chances/fixture/#{fixture_id}", body: [{ chances: 1 }])
      stub_widget("match/#{fixture_id}/odds", body: [{ odds: 1 }])

      out = client.fetch_all(fixture_id: fixture_id)
      expect(out.keys).to contain_exactly(:recent_results, :team_records, :players, :chances, :odds)
      expect(out[:players]).to eq('players' => true)
      expect(out[:chances]).to eq([{ 'chances' => 1 }])
    end

    it 'isolates per-widget failures (one 500 does not abort the batch)' do
      stub_widget("match/#{fixture_id}/recent-results", body: { recents: true })
      stub_widget("match/#{fixture_id}/team-records", body: { records: true })
      stub_widget("match/#{fixture_id}/players", status: 503)
      stub_widget("chances/fixture/#{fixture_id}", body: [])
      stub_widget("match/#{fixture_id}/odds", body: [])

      logged = []
      out = client.fetch_all(fixture_id: fixture_id, logger: ->(m) { logged << m })
      expect(out).to have_key(:players)
      expect(out[:players]).to be_nil
      expect(out[:recent_results]).to eq('recents' => true)
      expect(logged).to include(a_string_matching(/players/i))
    end
  end

  describe '#fetch_fixtures_by_date' do
    it 'GETs /api/widget/fixtures/date/{date} with token and required headers' do
      stub = stub_request(:get, 'https://api.choistats.com/api/widget/fixtures/date/2026-05-12')
        .with(
          query: hash_including('token' => token, 'clflc' => 'abc'),
          headers: { 'X-Adamchoi-Api-Token' => token, 'Referer' => 'https://www.adamchoi.co.uk/' }
        )
        .to_return(status: 200, body: { date: 0, leagues: [] }.to_json)

      result = client.fetch_fixtures_by_date('2026-05-12')
      expect(result).to have_key('leagues')
      expect(stub).to have_been_requested
    end

    it 'accepts a Date object and converts to YYYY-MM-DD string' do
      stub = stub_request(:get, %r{api\.choistats\.com/api/widget/fixtures/date/2026-05-12})
        .with(query: hash_including('token' => token))
        .to_return(status: 200, body: { date: 0, leagues: [] }.to_json)

      client.fetch_fixtures_by_date(Date.new(2026, 5, 12))
      expect(stub).to have_been_requested
    end

    it 'raises AuthError on HTTP 401' do
      stub_request(:get, %r{/api/widget/fixtures/date/}).to_return(status: 401, body: 'unauthorized')
      expect { client.fetch_fixtures_by_date('2026-05-12') }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::AuthError)
    end

    it 'raises ServerError on HTTP 5xx' do
      stub_request(:get, %r{/api/widget/fixtures/date/}).to_return(status: 503, body: 'down')
      expect { client.fetch_fixtures_by_date('2026-05-12') }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::ServerError)
    end

    it 'raises RateLimitError on HTTP 429' do
      stub_request(:get, %r{/api/widget/fixtures/date/})
        .to_return(status: 429, body: 'slow down', headers: { 'Retry-After' => '5' })
      expect { client.fetch_fixtures_by_date('2026-05-12') }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::RateLimitError) { |e|
          expect(e.retry_after).to eq(5)
        }
    end

    it 'raises ServerError on malformed JSON response' do
      stub_request(:get, %r{/api/widget/fixtures/date/}).to_return(status: 200, body: 'not json')
      expect { client.fetch_fixtures_by_date('2026-05-12') }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::ServerError, /invalid JSON/)
    end
  end

  describe '#fetch_referee_fixtures' do
    let(:referee_id) { 14343 }

    it 'GETs /api/widget/referee/{id}/fixtures with the configured token and required headers' do
      stub = stub_request(:get, %r{api\.choistats\.com/api/widget/referee/#{referee_id}/fixtures})
        .with(
          query: hash_including('token' => token, 'clflc' => 'abc'),
          headers: { 'X-Adamchoi-Api-Token' => token, 'Referer' => 'https://www.adamchoi.co.uk/' }
        )
        .to_return(status: 200, body: [{ id: 1, referee: { name: 'Marco Guida' } }].to_json)

      result = client.fetch_referee_fixtures(referee_id: referee_id)
      expect(result).to be_an(Array)
      expect(result.first['referee']).to eq('name' => 'Marco Guida')
      expect(stub).to have_been_requested
    end

    it 'raises domain errors for 401 / 5xx / 429 just like fetch_widget' do
      stub_request(:get, %r{api\.choistats\.com/api/widget/referee/#{referee_id}/fixtures})
        .to_return(status: 503, body: 'down')
      expect { client.fetch_referee_fixtures(referee_id: referee_id) }
        .to raise_error(AdamStats::Scraper::ChoistatsApiClient::ServerError)
    end
  end
end
