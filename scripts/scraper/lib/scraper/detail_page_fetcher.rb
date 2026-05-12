require 'json'
require_relative 'playwright_session'

module AdamStats
  module Scraper
    # ===========================================================================
    # DEPRECATED — 2026-05-12
    # ===========================================================================
    # DetailPageFetcher is NO LONGER the default detail fetcher.
    # The default is now ChoistatsApiFetcher (HTTP-direct, ~200ms/fixture, no
    # Playwright dependency, no listener/memory-leak at scale).
    #
    # Reason for retirement: under batch of ~150+ fixtures the Playwright Page
    # degrades progressively — listener accumulation + Chromium memory leak —
    # even with page.off('response', handler) in the ensure block. Lesson #13
    # in CLAUDE.md documents the full incident.
    #
    # This file is KEPT as fallback in case api.choistats.com changes its auth
    # model or rate-limits aggressively. To reactivate, pass
    # `detail_fetcher: DetailPageFetcher.new` to Orchestrator.run explicitly.
    # DO NOT DELETE without a documented replacement path.
    # ===========================================================================
    #
    # Carrega a página de detalhe do adamchoi e, ao mesmo tempo, intercepta as
    # respostas JSON dos widgets do choistats (`api.choistats.com`). Devolve
    # `{ html: String, widgets: Hash }` pronto para o `DetailParser` consumir.
    class DetailPageFetcher
      DEFAULT_WAIT_SELECTOR = 'tbody tr td'.freeze
      DEFAULT_TIMEOUT_MS = 60_000
      WIDGET_SETTLE_SECONDS = 5

      WIDGET_KEYS = {
        recent_results: %r{/api/widget/match/\d+/recent-results},
        team_records: %r{/api/widget/match/\d+/team-records},
        chances: %r{/api/widget/chances/fixture/\d+},
        odds_all: %r{/api/widget/match/\d+/odds(?:\?|$)},
        odds_market: %r{/api/widget/match/\d+/odds/[^/]+/market},
        players: %r{/api/widget/match/\d+/players}
      }.freeze

      def initialize(session: PlaywrightSession.new)
        @session = session
      end

      def fetch(url, wait_selector: DEFAULT_WAIT_SELECTOR, timeout_ms: DEFAULT_TIMEOUT_MS)
        # Não confie no valor de retorno do bloco — alguns wrappers (e fakes nos
        # testes) descartam ou substituem o valor por algo do próprio session.
        captured = nil
        @session.with_page do |page|
          captured = fetch_with_page(page, url, wait_selector: wait_selector, timeout_ms: timeout_ms)
        end
        captured
      end

      # Variant que usa uma página já aberta — usada pelo pool concorrente.
      # O caller é dono do ciclo de vida da page.
      def fetch_with_page(page, url, wait_selector: DEFAULT_WAIT_SELECTOR, timeout_ms: DEFAULT_TIMEOUT_MS)
        result = { html: nil, widgets: {} }
        handler = lambda { |response| handle_response(response, result[:widgets]) }
        page.on('response', handler)

        begin
          page.goto(url, waitUntil: 'domcontentloaded', timeout: timeout_ms)
          page.wait_for_selector(wait_selector, timeout: timeout_ms)
          # Widgets disparam XHRs após render inicial; esperar antes de drenar.
          sleep(WIDGET_SETTLE_SECONDS)
          result[:html] = page.content
          result
        ensure
          # Remove o listener para não vazar entre fixtures (reuso da page no pool).
          # Sem isso, cada call acumula N handlers que processam cada response da
          # próxima fixture — degrada perf após ~50 fixtures.
          begin
            page.off('response', handler)
          rescue StandardError
            # ignore — fallback é não vazar info, só perf
          end
        end
      end

      private

      def handle_response(response, bucket)
        url = response.url
        key = WIDGET_KEYS.find { |_, pattern| url.match?(pattern) }&.first
        return unless key
        return if bucket.key?(key)

        begin
          body = response.text
          parsed = JSON.parse(body)
          bucket[key] = parsed
        rescue JSON::ParserError, StandardError
          # Ignorar respostas não-JSON ou falhas pontuais de leitura.
        end
      end
    end
  end
end
