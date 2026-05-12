require 'faraday'
require 'faraday/retry'
require 'json'

module AdamStats
  module Scraper
    # HTTP client direto pra api.choistats.com — pula o render Angular do
    # adamchoi e busca os JSONs dos widgets em ~400ms cada. O token é estático
    # (mesmo valor pra qualquer fixture, embutido nas detail pages); o header
    # x-adamchoi-api-token e o Referer https://www.adamchoi.co.uk/ são
    # obrigatórios — sem eles a API responde 401.
    class ChoistatsApiClient
      class Error < StandardError; end
      class AuthError < Error; end
      class ServerError < Error; end
      class RateLimitError < Error
        attr_reader :retry_after
        def initialize(msg, retry_after: nil)
          super(msg)
          @retry_after = retry_after
        end
      end

      DEFAULT_TOKEN = '45834886-68b3-11eb-99f4-9e36325824ad'.freeze
      DEFAULT_BASE_URL = 'https://api.choistats.com'.freeze
      DEFAULT_REFERER = 'https://www.adamchoi.co.uk/'.freeze
      DEFAULT_TIMEOUT_S = 15

      WIDGET_PATHS = {
        recent_results: ->(id) { "/api/widget/match/#{id}/recent-results" },
        team_records:   ->(id) { "/api/widget/match/#{id}/team-records" },
        players:        ->(id) { "/api/widget/match/#{id}/players" },
        chances:        ->(id) { "/api/widget/chances/fixture/#{id}" },
        odds:           ->(id) { "/api/widget/match/#{id}/odds" }
      }.freeze

      WIDGET_QUERIES = {
        players: { 'isOverall' => 'true' },
        chances: { 'bookmakerId' => '' },
        odds:    { 'lang' => 'en' }
      }.freeze

      def initialize(token: ENV['ADAMCHOI_API_TOKEN'] || DEFAULT_TOKEN,
                     base_url: DEFAULT_BASE_URL,
                     referer: DEFAULT_REFERER,
                     timeout: DEFAULT_TIMEOUT_S)
        @token = token
        @referer = referer
        @conn = Faraday.new(url: base_url) do |f|
          f.request :retry, max: 2, interval: 0.3,
                            interval_randomness: 0.5,
                            backoff_factor: 2,
                            exceptions: [Faraday::TimeoutError, Faraday::ConnectionFailed],
                            retry_statuses: [502, 504]
          f.options.timeout = timeout
          f.options.open_timeout = 5
        end
      end

      def fetch_widget(kind, fixture_id:)
        builder = WIDGET_PATHS[kind] or raise ArgumentError, "unknown widget kind: #{kind.inspect}"

        path = builder.call(fixture_id)
        query = base_query.merge(WIDGET_QUERIES[kind] || {})

        response = @conn.get(path) do |req|
          req.params.update(query)
          req.headers['X-Adamchoi-Api-Token'] = @token
          req.headers['Referer'] = @referer
          req.headers['Accept'] = 'application/json, text/plain, */*'
        end

        handle_response!(response, kind)
        JSON.parse(response.body)
      rescue JSON::ParserError => e
        raise ServerError, "invalid JSON for #{kind} fixture=#{fixture_id}: #{e.message}"
      end

      # Busca os 5 widgets canônicos pra uma fixture. Falhas isoladas: se um
      # widget falhar, registra no logger e devolve `nil` naquela chave em vez de
      # abortar o batch.
      def fetch_all(fixture_id:, logger: ->(_) {})
        WIDGET_PATHS.keys.each_with_object({}) do |kind, out|
          out[kind] =
            begin
              fetch_widget(kind, fixture_id: fixture_id)
            rescue StandardError => e
              logger.call("[choistats] widget #{kind} for fixture=#{fixture_id} failed: #{e.class}: #{e.message}")
              nil
            end
        end
      end

      # Lista todas as fixtures de um dia via endpoint de listagem.
      # Aceita Date ou String "YYYY-MM-DD". Retorna o Hash parseado da API.
      def fetch_fixtures_by_date(date)
        date_iso = date.respond_to?(:strftime) ? date.strftime('%Y-%m-%d') : date.to_s

        response = @conn.get("/api/widget/fixtures/date/#{date_iso}") do |req|
          req.params.update(base_query)
          req.headers['X-Adamchoi-Api-Token'] = @token
          req.headers['Referer'] = @referer
          req.headers['Accept'] = 'application/json, text/plain, */*'
        end

        handle_response!(response, :fixtures_by_date)
        JSON.parse(response.body)
      rescue JSON::ParserError => e
        raise ServerError, "invalid JSON for fixtures_by_date date=#{date_iso}: #{e.message}"
      end

      # Histórico de fixtures de um árbitro. Devolve um array com booking points
      # e yellow_reds por jogo (~36 jogos por árbitro). Usado pra cruzar perfil
      # do árbitro com markets de cartões / booking points.
      def fetch_referee_fixtures(referee_id:)
        path = "/api/widget/referee/#{referee_id}/fixtures"
        response = @conn.get(path) do |req|
          req.params.update(base_query)
          req.headers['X-Adamchoi-Api-Token'] = @token
          req.headers['Referer'] = @referer
          req.headers['Accept'] = 'application/json, text/plain, */*'
        end

        handle_response!(response, :referee_fixtures)
        JSON.parse(response.body)
      rescue JSON::ParserError => e
        raise ServerError, "invalid JSON for referee_fixtures referee=#{referee_id}: #{e.message}"
      end

      private

      def base_query
        { 'clflc' => 'abc', 'token' => @token }
      end

      def handle_response!(response, kind)
        return if response.status.between?(200, 299)

        case response.status
        when 401, 403
          raise AuthError, "#{kind} HTTP #{response.status}"
        when 429
          retry_after = response.headers['Retry-After'].to_i
          raise RateLimitError.new("#{kind} HTTP 429", retry_after: retry_after)
        when 500..599
          raise ServerError, "#{kind} HTTP #{response.status}"
        else
          raise Error, "#{kind} HTTP #{response.status}"
        end
      end
    end
  end
end
