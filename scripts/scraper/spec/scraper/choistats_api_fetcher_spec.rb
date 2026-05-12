require_relative '../../lib/scraper/choistats_api_fetcher'

RSpec.describe AdamStats::Scraper::ChoistatsApiFetcher do
  let(:client) { instance_double(AdamStats::Scraper::ChoistatsApiClient) }
  let(:fetcher) { described_class.new(client: client) }
  let(:abs_url) { 'https://www.adamchoi.co.uk/fixture/19618110/italy-coppa-italia-lazio-vs-inter' }

  describe '#fetch' do
    it 'extracts fixture_id from the URL, calls client.fetch_all, returns { html: "", widgets: ... }' do
      widgets = { recent_results: {}, team_records: {}, players: {}, chances: [], odds: [] }
      expect(client).to receive(:fetch_all).with(fixture_id: 19618110, logger: anything).and_return(widgets)

      result = fetcher.fetch(abs_url)
      expect(result[:html]).to eq('')
      expect(result[:widgets]).to eq(widgets)
    end

    it 'returns empty payload when the URL has no /fixture/{id}/ component' do
      expect(client).not_to receive(:fetch_all)
      result = fetcher.fetch('https://www.adamchoi.co.uk/about')
      expect(result).to eq(html: '', widgets: {})
    end

    it 'propagates the logger down to client.fetch_all so per-widget failures get logged' do
      logged = []
      logger = ->(m) { logged << m }
      expect(client).to receive(:fetch_all).with(fixture_id: 19618110, logger: logger).and_return({})
      fetcher.fetch(abs_url, logger: logger)
    end
  end

  describe '#fetch_with_page' do
    it 'ignores the page argument and behaves the same as #fetch (compat with pool flow)' do
      widgets = { recent_results: { a: 1 } }
      expect(client).to receive(:fetch_all).with(fixture_id: 19618110, logger: anything).and_return(widgets)
      result = fetcher.fetch_with_page(:any_page_object, abs_url)
      expect(result[:widgets]).to eq(widgets)
    end
  end

  describe 'referee second-pass fetch' do
    it 'fetches /referee/{id}/fixtures when recent_results carries fixture.referee.id and merges as :referee_fixtures' do
      base_widgets = {
        recent_results: { 'fixture' => { 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } } }
      }
      expect(client).to receive(:fetch_all).with(fixture_id: 19618110, logger: anything).and_return(base_widgets)
      expect(client).to receive(:fetch_referee_fixtures).with(referee_id: 14343).and_return([{ 'id' => 1, 'homeBookingPoints' => 40 }])

      result = fetcher.fetch(abs_url)
      expect(result[:widgets][:referee_fixtures]).to eq([{ 'id' => 1, 'homeBookingPoints' => 40 }])
    end

    it 'falls back to players.fixture.referee.id when recent_results lacks it' do
      base_widgets = {
        recent_results: nil,
        players: { 'fixture' => { 'referee' => { 'id' => 999, 'name' => 'Other Ref' } } }
      }
      expect(client).to receive(:fetch_all).and_return(base_widgets)
      expect(client).to receive(:fetch_referee_fixtures).with(referee_id: 999).and_return([])
      result = fetcher.fetch(abs_url)
      expect(result[:widgets]).to have_key(:referee_fixtures)
    end

    it 'skips the second-pass when no referee.id is available' do
      base_widgets = { recent_results: { 'fixture' => {} }, players: nil }
      expect(client).to receive(:fetch_all).and_return(base_widgets)
      expect(client).not_to receive(:fetch_referee_fixtures)
      result = fetcher.fetch(abs_url)
      expect(result[:widgets]).not_to have_key(:referee_fixtures)
    end

    it 'isolates failures of the referee fetch (logs but does not raise)' do
      base_widgets = { recent_results: { 'fixture' => { 'referee' => { 'id' => 14343 } } } }
      allow(client).to receive(:fetch_all).and_return(base_widgets)
      allow(client).to receive(:fetch_referee_fixtures).and_raise(StandardError, 'boom')
      logged = []
      logger = ->(m) { logged << m }
      result = fetcher.fetch(abs_url, logger: logger)
      expect(result[:widgets][:referee_fixtures]).to be_nil
      expect(logged).to include(a_string_matching(/referee/i))
    end
  end
end
