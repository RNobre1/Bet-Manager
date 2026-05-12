require 'json'
require_relative '../../lib/scraper/detail_page_fetcher'

RSpec.describe AdamStats::Scraper::DetailPageFetcher do
  let(:base_url) { 'https://www.adamchoi.co.uk/fixture/123/x-vs-y' }
  let(:html_body) { '<html><body>detail</body></html>' }

  def fake_page(responses: [])
    page = double('page')
    response_listeners = []
    allow(page).to receive(:on) do |event, lambda|
      response_listeners << lambda if event == 'response'
    end
    allow(page).to receive(:off) do |event, lambda|
      response_listeners.delete(lambda) if event == 'response'
    end
    allow(page).to receive(:goto)
    # Emite as responses durante o wait_for_selector — ponto em que, no real,
    # as XHRs dos widgets disparam, e o listener ainda está ativo.
    allow(page).to receive(:wait_for_selector) do
      responses.each { |res| response_listeners.each { |l| l.call(res) } }
    end
    allow(page).to receive(:content).and_return(html_body)
    page.define_singleton_method(:_emit_responses) { nil } # kept for back-compat; no-op now
    page
  end

  def fake_response(url:, body:)
    res = double('response')
    allow(res).to receive(:url).and_return(url)
    allow(res).to receive(:text).and_return(body)
    res
  end

  def fake_session(page:)
    session = double('session')
    allow(session).to receive(:with_page) do |&block|
      block.call(page)
      page._emit_responses
    end
    session
  end

  it 'returns HTML and an empty widgets hash when no widget responses fire' do
    page = fake_page(responses: [])
    fetcher = described_class.new(session: fake_session(page: page))
    allow(fetcher).to receive(:sleep)
    result = fetcher.fetch(base_url)
    expect(result[:html]).to eq(html_body)
    expect(result[:widgets]).to eq({})
  end

  it 'captures recent-results, team-records, chances, odds and players responses by key' do
    responses = [
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/recent-results?token=t', body: '{"recent":1}'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/team-records?token=t', body: '{"records":1}'),
      fake_response(url: 'https://api.choistats.com/api/widget/chances/fixture/123?token=t', body: '[{"chance":1}]'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/odds?token=t', body: '[{"odds":1}]'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/odds/Win/market?token=t', body: '{"market":"Win"}'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/players?token=t', body: '{"players":1}')
    ]
    page = fake_page(responses: responses)
    fetcher = described_class.new(session: fake_session(page: page))
    allow(fetcher).to receive(:sleep)
    result = fetcher.fetch(base_url)
    expect(result[:widgets].keys).to contain_exactly(
      :recent_results, :team_records, :chances, :odds_all, :odds_market, :players
    )
    expect(result[:widgets][:recent_results]).to eq('recent' => 1)
    expect(result[:widgets][:chances]).to eq([{ 'chance' => 1 }])
  end

  it 'ignores unrelated responses (analytics, images, etc.)' do
    responses = [
      fake_response(url: 'https://analytics.google.com/collect', body: 'ok'),
      fake_response(url: 'https://cdn.choistats.com/assets/flags/gb-eng.svg', body: '<svg/>'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/recent-results?token=t', body: '{"r":1}')
    ]
    page = fake_page(responses: responses)
    fetcher = described_class.new(session: fake_session(page: page))
    allow(fetcher).to receive(:sleep)
    result = fetcher.fetch(base_url)
    expect(result[:widgets].keys).to eq([:recent_results])
  end

  it 'tolerates a JSON parse error on one response and keeps the others' do
    responses = [
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/recent-results?token=t', body: 'not json {'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/team-records?token=t', body: '{"ok":1}')
    ]
    page = fake_page(responses: responses)
    fetcher = described_class.new(session: fake_session(page: page))
    allow(fetcher).to receive(:sleep)
    result = fetcher.fetch(base_url)
    expect(result[:widgets].keys).to eq([:team_records])
  end

  it 'keeps the first widget response for a given key (ignores duplicates)' do
    responses = [
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/recent-results?a=1', body: '{"r":"first"}'),
      fake_response(url: 'https://api.choistats.com/api/widget/match/123/recent-results?a=2', body: '{"r":"second"}')
    ]
    page = fake_page(responses: responses)
    fetcher = described_class.new(session: fake_session(page: page))
    allow(fetcher).to receive(:sleep)
    result = fetcher.fetch(base_url)
    expect(result[:widgets][:recent_results]).to eq('r' => 'first')
  end

  it 'removes the response listener after fetch_with_page returns (no leak across reused pages)' do
    page = double('page')
    listeners = []
    allow(page).to receive(:on) { |_event, l| listeners << l }
    allow(page).to receive(:off) { |_event, l| listeners.delete(l) }
    allow(page).to receive(:goto)
    allow(page).to receive(:wait_for_selector)
    allow(page).to receive(:content).and_return(html_body)

    fetcher = described_class.new(session: double('session'))
    allow(fetcher).to receive(:sleep)
    fetcher.fetch_with_page(page, 'https://example.test/fixture/1')
    fetcher.fetch_with_page(page, 'https://example.test/fixture/2')
    fetcher.fetch_with_page(page, 'https://example.test/fixture/3')

    expect(listeners).to be_empty
  end

  it 'still removes the listener even when wait_for_selector raises (ensure cleanup)' do
    page = double('page')
    listeners = []
    allow(page).to receive(:on) { |_event, l| listeners << l }
    allow(page).to receive(:off) { |_event, l| listeners.delete(l) }
    allow(page).to receive(:goto)
    allow(page).to receive(:wait_for_selector).and_raise(StandardError, 'timeout simulated')
    allow(page).to receive(:content).and_return(html_body)

    fetcher = described_class.new(session: double('session'))
    allow(fetcher).to receive(:sleep)
    expect { fetcher.fetch_with_page(page, 'https://example.test/fixture/1') }
      .to raise_error(StandardError, 'timeout simulated')
    expect(listeners).to be_empty
  end
end
