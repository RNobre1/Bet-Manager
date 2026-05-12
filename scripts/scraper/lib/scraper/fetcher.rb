require 'playwright'

module AdamStats
  module Scraper
    # DEPRECATED: Playwright-based HTML fetcher for the fixtures listing page.
    # Replaced by ApiListFetcher (HTTP-direct, no browser, <500ms vs ~30s).
    # Kept as fallback; reactivate with ENV SCRAPER_USE_PLAYWRIGHT_LIST=1.
    # Do NOT remove — DetailPageFetcher also depends on playwright-ruby-client.
    class FetchError < StandardError
      attr_reader :status

      def initialize(message, status: nil)
        super(message)
        @status = status
      end
    end

    class FetchTimeoutError < FetchError; end

    module Fetcher
      DEFAULT_TIMEOUT_MS = 30_000

      module_function

      def fetch(url, wait_selector:, timeout_ms: DEFAULT_TIMEOUT_MS, session: default_session)
        html = nil

        session.with_page do |page|
          begin
            response = page.goto(url, waitUntil: 'domcontentloaded', timeout: timeout_ms)
            status = response&.status
            raise FetchError.new("non-2xx response: #{status}", status: status) if status && status >= 400

            page.wait_for_selector(wait_selector, timeout: timeout_ms)
            html = page.content
          rescue ::Playwright::TimeoutError => e
            raise FetchTimeoutError.new("timed out waiting for #{wait_selector}: #{e.message}")
          rescue FetchError
            raise
          rescue StandardError => e
            raise FetchError.new(e.message)
          end
        end

        html
      end

      def default_session
        PlaywrightSession.new
      end
      private_class_method :default_session
    end
  end
end

require_relative 'playwright_session'
