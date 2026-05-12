require 'date'
require 'time'
require_relative 'fixture'
require_relative 'uk_time_helper'

module AdamStats
  module Scraper
    # Parses the JSON response from GET /api/widget/fixtures/date/YYYY-MM-DD
    # into Fixture structs. Pure function — no I/O.
    #
    # Two public interfaces:
    #   parse(hash)           → Array<Fixture>
    #   parse_with_utc(hash)  → Array<{ fixture: Fixture, kickoff_utc: Time }>
    #
    # The JSON already carries UTC milliseconds for the kickoff instant, so no
    # UK-clock guesswork needed. match_date and ko_time are *derived* from the
    # UTC instant using UkTimeHelper (inverse direction: UTC → UK local), so
    # the UNIQUE(match_date, home_team, away_team) constraint stays consistent
    # with rows written by the old Playwright+Parser path (both express the date
    # in UK local time, as adamchoi does).
    module ListApiParser
      module_function

      # Returns flat Array<Fixture>. kickoff_utc is *not* in the Fixture struct;
      # the Persister derives it from match_date+ko_time via UkTimeHelper (same
      # as always). This keeps the existing persist path unchanged.
      def parse(payload)
        return [] if payload.nil?

        parse_with_utc(payload).map { |entry| entry[:fixture] }
      end

      # Returns Array<{ fixture: Fixture, kickoff_utc: Time }>.
      # Callers (e.g. ApiListFetcher) can use kickoff_utc directly if they want
      # to skip the UkTimeHelper round-trip in the Persister (future optimisation;
      # not required now because Persister recomputes it and it's idempotent).
      def parse_with_utc(payload)
        return [] if payload.nil?

        leagues = payload['leagues'] || []
        leagues.flat_map do |league_block|
          parse_league(league_block)
        end.compact
      end

      private

      def parse_league(league_block)
        league_info = league_block['league'] || {}
        league_name = league_info['name']
        country_raw = league_info.dig('country', 'name')
        country     = country_raw ? country_raw.strip.downcase : nil

        fixtures = league_block['fixtures'] || []
        fixtures.filter_map do |fx|
          parse_fixture(fx, league: league_name, country: country)
        end
      end
      module_function :parse_league
      private_class_method :parse_league

      def parse_fixture(fx, league:, country:)
        id       = fx['id']
        date_ms  = fx['date']
        home     = fx.dig('homeTeam', 'name').to_s.strip
        away     = fx.dig('awayTeam', 'name').to_s.strip

        return nil if id.nil? || date_ms.nil? || home.empty? || away.empty?

        kickoff_utc = Time.at(date_ms / 1000).utc
        match_date, ko_time = UkTimeHelper.utc_to_uk_local(kickoff_utc)

        fixture = Fixture.new(
          match_date: match_date,
          ko_time:    ko_time,
          home_team:  home,
          away_team:  away,
          league:     league,
          source_url: "/fixture/#{id}",
          country:    country
        )

        { fixture: fixture, kickoff_utc: kickoff_utc }
      end
      module_function :parse_fixture
      private_class_method :parse_fixture
    end
  end
end
