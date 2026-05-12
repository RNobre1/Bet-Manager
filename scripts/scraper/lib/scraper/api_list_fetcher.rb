require 'date'
require_relative 'choistats_api_client'
require_relative 'list_api_parser'

module AdamStats
  module Scraper
    # HTTP-direct fixture listing via api.choistats.com/api/widget/fixtures/date/{date}.
    # Replaces the Playwright-based Fetcher for the listing step — no browser needed.
    #
    # Implements the :fetch_list interface expected by Orchestrator:
    #   fetch_list(days_ahead: N, from_date: Date, league_slugs: [], logger: ->(m){}) → Array<Fixture>
    #
    # Also exposes #fetch_with_utc for callers that need the raw kickoff_utc alongside
    # each Fixture (without re-deriving from match_date+ko_time).
    class ApiListFetcher
      DEFAULT_DAYS_AHEAD = 7

      def initialize(client: ChoistatsApiClient.new)
        @client = client
      end

      # Orchestrator-compatible interface. Returns Array<Fixture>.
      # league_slugs filtering happens post-parse (same as the old Playwright path).
      def fetch_list(days_ahead: DEFAULT_DAYS_AHEAD, from_date: Date.today,
                     league_slugs: [], logger: ->(m) { warn m })
        dates = dates_range(from_date, days_ahead)
        fixtures = fetch_fixtures_for_dates(dates, logger: logger)

        if league_slugs.any?
          filtered = filter_by_league_slugs(fixtures, league_slugs)
          logger.call("[list] league whitelist active: #{filtered.size}/#{fixtures.size} fixtures") if fixtures.size != filtered.size
          filtered
        else
          fixtures
        end
      end

      # Fetch fixtures for an explicit array of Date objects. Returns Array<Fixture>.
      # Per-date failures are isolated: one 5xx does not abort the batch.
      def fetch_fixtures_for_dates(dates, logger: ->(m) { warn m })
        unique_dates = dates.uniq
        return [] if unique_dates.empty?

        unique_dates.flat_map do |date|
          fetch_date(date, logger: logger)
        end
      end

      # Like fetch_fixtures_for_dates but returns Array<{ fixture: Fixture, kickoff_utc: Time }>.
      def fetch_with_utc(dates, logger: ->(m) { warn m })
        unique_dates = dates.uniq
        return [] if unique_dates.empty?

        unique_dates.flat_map do |date|
          fetch_date_with_utc(date, logger: logger)
        end
      end

      # Convenience: fetch today through today+(days_ahead-1). Returns Array<Fixture>.
      def fetch_days_ahead(days_ahead: DEFAULT_DAYS_AHEAD, from_date: Date.today,
                           logger: ->(m) { warn m })
        fetch_fixtures_for_dates(dates_range(from_date, days_ahead), logger: logger)
      end

      private

      def dates_range(from_date, days_ahead)
        (0...days_ahead).map { |i| from_date + i }
      end

      def fetch_date(date, logger:)
        date_iso = date.respond_to?(:strftime) ? date.strftime('%Y-%m-%d') : date.to_s
        logger.call("[list] fetching fixtures for #{date_iso}")
        payload = @client.fetch_fixtures_by_date(date_iso)
        ListApiParser.parse(payload)
      rescue StandardError => e
        logger.call("[list] failed to fetch fixtures for #{date_iso}: #{e.class}: #{e.message}")
        []
      end

      def fetch_date_with_utc(date, logger:)
        date_iso = date.respond_to?(:strftime) ? date.strftime('%Y-%m-%d') : date.to_s
        logger.call("[list] fetching fixtures (with utc) for #{date_iso}")
        payload = @client.fetch_fixtures_by_date(date_iso)
        ListApiParser.parse_with_utc(payload)
      rescue StandardError => e
        logger.call("[list] failed to fetch fixtures for #{date_iso}: #{e.class}: #{e.message}")
        []
      end

      def filter_by_league_slugs(fixtures, slugs)
        prefixes = slugs.map { |s| "#{s.chomp('-')}-" }
        fixtures.select do |fx|
          path = fx.source_url.to_s.sub(%r{^/fixture/\d+/?}, '')
          # source_url from ApiListFetcher is "/fixture/{id}" (no slug path).
          # League slug filtering is not applicable here — fall through to all.
          # The orchestrator's whitelist applies to detail fetching, not listing.
          # Return all when source_url has no slug component.
          path.empty? || prefixes.any? { |pre| path.start_with?(pre) }
        end
      end
    end
  end
end
