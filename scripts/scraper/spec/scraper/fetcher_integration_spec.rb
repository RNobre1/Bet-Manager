require_relative '../../lib/scraper/fetcher'
require_relative '../../lib/scraper/playwright_session'

RSpec.describe 'Fetcher integration', :slow, :network do
  before(:all) do
    skip 'set RUN_NETWORK_TESTS=1 to enable real network tests' unless ENV['RUN_NETWORK_TESTS'] == '1'
  end

  it 'fetches the real adamchoi /fixtures page' do
    base = ENV.fetch('SCRAPER_TARGET_BASE_URL', 'https://www.adamchoi.co.uk')
    session = AdamStats::Scraper::PlaywrightSession.new

    html = AdamStats::Scraper::Fetcher.fetch(
      "#{base}/fixtures",
      wait_selector: 'tr[data-ng-repeat*="fixture in"]',
      timeout_ms: 30_000,
      session: session
    )

    expect(html.bytesize).to be > 100_000
    expect(html).to include('fixture-team')
  end
end
