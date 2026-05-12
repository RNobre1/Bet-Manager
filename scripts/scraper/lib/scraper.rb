require_relative 'scraper/orchestrator'
require_relative 'scraper/playwright_session'
require_relative 'scraper/choistats_api_fetcher'

module AdamStats
  module Scraper
    module_function

    def run(args = {})
      # Default detail fetcher: ChoistatsApiFetcher (HTTP direto, ~9x mais
      # rápido que renderizar Angular). O Playwright continua sendo usado pra
      # baixar a página de listagem (/fixtures), que precisa de render.
      args[:detail_fetcher] ||= ChoistatsApiFetcher.new

      # Page pool só é necessário pra detail render — no fluxo HTTP-direct, a
      # session pode ficar nil e o Orchestrator cai no caminho serial (que com
      # ApiFetcher é rápido o suficiente). Mantém compat: quem passar
      # detail_session explicitamente força o caminho pool/Playwright.
      Orchestrator.run(**args)
      0
    rescue StandardError => e
      warn "[scrape] uncaught #{e.class}: #{e.message}"
      e.backtrace&.each { |line| warn "  #{line}" }
      1
    end
  end
end
