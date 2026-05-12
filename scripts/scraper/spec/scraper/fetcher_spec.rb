require_relative '../../lib/scraper/fetcher'

RSpec.describe AdamStats::Scraper::Fetcher do
  let(:html_body) { '<html><body>fixtures</body></html>' }

  def fake_page(content: html_body, goto_status: 200, wait_raises: nil, &on_goto)
    page = double('page')
    response = double('response', status: goto_status)
    allow(page).to receive(:goto) do |*_args, **_kwargs|
      on_goto&.call
      response
    end
    if wait_raises
      allow(page).to receive(:wait_for_selector).and_raise(wait_raises)
    else
      allow(page).to receive(:wait_for_selector).and_return(double('handle'))
    end
    allow(page).to receive(:content).and_return(content)
    allow(page).to receive(:close)
    page
  end

  def fake_session(page:)
    session = double('session')
    allow(session).to receive(:with_page).and_yield(page)
    session
  end

  describe '.fetch (happy path)' do
    it 'returns HTML from page.content after wait_for_selector resolves' do
      page = fake_page
      session = fake_session(page: page)

      result = described_class.fetch(
        'https://example.com/fixtures',
        wait_selector: 'tr.fixture',
        session: session
      )
      expect(result).to eq(html_body)
    end

    it 'navigates with waitUntil: domcontentloaded' do
      page = fake_page
      session = fake_session(page: page)
      expect(page).to receive(:goto).with(
        'https://example.com/fixtures',
        hash_including(waitUntil: 'domcontentloaded')
      ).and_return(double(status: 200))

      described_class.fetch(
        'https://example.com/fixtures',
        wait_selector: 'tr.fixture',
        session: session
      )
    end

    it 'waits for the given selector with the given timeout' do
      page = fake_page
      session = fake_session(page: page)
      expect(page).to receive(:wait_for_selector).with(
        'tr.fixture',
        hash_including(timeout: 5_000)
      )

      described_class.fetch(
        'https://example.com/fixtures',
        wait_selector: 'tr.fixture',
        timeout_ms: 5_000,
        session: session
      )
    end
  end

  describe '.fetch (errors)' do
    it 'raises FetchError with status code on non-2xx response' do
      page = fake_page(goto_status: 404)
      session = fake_session(page: page)

      expect {
        described_class.fetch(
          'https://example.com/missing',
          wait_selector: 'tr.fixture',
          session: session
        )
      }.to raise_error(AdamStats::Scraper::FetchError) { |e|
        expect(e.status).to eq(404)
      }
    end

    it 'raises FetchTimeoutError when wait_for_selector times out' do
      timeout_error = ::Playwright::TimeoutError.new(message: 'timed out')
      page = fake_page(wait_raises: timeout_error)
      session = fake_session(page: page)

      expect {
        described_class.fetch(
          'https://example.com/fixtures',
          wait_selector: 'tr.fixture',
          session: session
        )
      }.to raise_error(AdamStats::Scraper::FetchTimeoutError)
    end

    it 'delegates page lifecycle to the session (does not call page.close itself)' do
      page = fake_page(wait_raises: ::Playwright::TimeoutError.new(message: 'boom'))
      session = fake_session(page: page)
      expect(page).not_to receive(:close)

      expect {
        described_class.fetch(
          'https://example.com/fixtures',
          wait_selector: 'tr.fixture',
          session: session
        )
      }.to raise_error(AdamStats::Scraper::FetchTimeoutError)
    end

    it 'wraps unexpected playwright errors as FetchError' do
      generic = StandardError.new('navigation failed')
      page = double('page')
      allow(page).to receive(:goto).and_raise(generic)
      allow(page).to receive(:close)
      session = fake_session(page: page)

      expect {
        described_class.fetch(
          'https://example.com/fixtures',
          wait_selector: 'tr.fixture',
          session: session
        )
      }.to raise_error(AdamStats::Scraper::FetchError, /navigation failed/)
    end
  end

  describe '.fetch (re-entrancy)' do
    it 'can be called twice in sequence' do
      page = fake_page
      session = fake_session(page: page)

      first = described_class.fetch('https://example.com/a', wait_selector: 'tr.fixture', session: session)
      second = described_class.fetch('https://example.com/b', wait_selector: 'tr.fixture', session: session)
      expect(first).to eq(html_body)
      expect(second).to eq(html_body)
    end
  end
end
