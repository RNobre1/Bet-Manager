require_relative 'choistats_api_client'

module AdamStats
  module Scraper
    # Implementa a interface mínima esperada pelo Orchestrator
    # (fetch / fetch_with_page) puxando os widgets via HTTP em vez de renderizar
    # a detail page no Playwright. Retorna { html: '', widgets: {...} } pra
    # manter compat com DetailParser.parse_detail.
    class ChoistatsApiFetcher
      FIXTURE_ID_REGEX = %r{/fixture/(\d+)(?:/|\?|$)}.freeze

      def initialize(client: ChoistatsApiClient.new)
        @client = client
      end

      def fetch(abs_url, logger: ->(_) {}, **_kwargs)
        fixture_id = extract_fixture_id(abs_url)
        return { html: '', widgets: {} } unless fixture_id

        widgets = @client.fetch_all(fixture_id: fixture_id, logger: logger)
        referee_id = extract_referee_id(widgets)
        if referee_id
          begin
            widgets[:referee_fixtures] = @client.fetch_referee_fixtures(referee_id: referee_id)
          rescue StandardError => e
            logger.call("[choistats] referee_fixtures referee=#{referee_id} failed: #{e.class}: #{e.message}")
            widgets[:referee_fixtures] = nil
          end
        end
        { html: '', widgets: widgets }
      end

      # Compat com `collect_details_parallel` — `page` é ignorada porque o
      # ChoistatsApiClient não precisa de browser.
      def fetch_with_page(_page, abs_url, logger: ->(_) {}, **kwargs)
        fetch(abs_url, logger: logger, **kwargs)
      end

      private

      def extract_fixture_id(url)
        return nil if url.nil? || url.empty?

        m = url.match(FIXTURE_ID_REGEX)
        m && m[1].to_i
      end

      # Procura o id do árbitro nos widgets recém-buscados. Hoje
      # `recent_results.fixture.referee.id` e `players.fixture.referee.id`
      # carregam o mesmo valor; tentamos um primeiro, depois o outro.
      def extract_referee_id(widgets)
        candidates = [widgets[:recent_results], widgets[:players]]
        candidates.each do |w|
          rid = w.is_a?(Hash) ? w.dig('fixture', 'referee', 'id') : nil
          return rid.to_i if rid
        end
        nil
      end
    end
  end
end
