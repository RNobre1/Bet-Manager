require 'date'
require 'nokogiri'
require_relative 'fixture'

module AdamStats
  module Scraper
    class ParseError < StandardError; end

    module Parser
      DATE_BLOCK_SELECTOR =
        '[data-ng-repeat*="date in"][data-ng-repeat*="filteredDates"]'.freeze
      LEAGUE_BLOCK_SELECTOR =
        'tbody[data-ng-repeat*="league in"][data-ng-repeat*="date.leagues"]'.freeze
      FIXTURE_ROW_SELECTOR =
        'tr[data-ng-repeat*="fixture in"][data-ng-repeat*="league.fixtures"]'.freeze
      LEAGUE_HEADER_SELECTOR = 'tr.header-row'.freeze
      TEAM_CELL_SELECTOR = 'td.fixture-team'.freeze
      KO_CELL_SELECTOR = 'td.ko-time'.freeze
      KO_LINK_SELECTOR = 'a.fixture-link'.freeze
      DATE_HEADING_SELECTOR = '.panel-heading, h2, h3, h4'.freeze
      HH_MM_REGEX = /\A(\d{2}:\d{2})/.freeze
      # URL pattern: /fixture/<id>/<country>-<rest>
      COUNTRY_FROM_URL_REGEX = %r{\A/fixture/\d+/([a-z][a-z0-9]*)(?:-|\z)}.freeze

      module_function

      def parse_fixtures_list(html)
        return [] if html.nil? || html.strip.empty?

        doc = Nokogiri::HTML(html) { |cfg| cfg.strict.recover }
        if looks_malformed?(html, doc)
          raise ParseError, 'HTML does not contain a recognizable fixtures structure'
        end

        date_blocks = doc.css(DATE_BLOCK_SELECTOR)
        return [] if date_blocks.empty?

        date_blocks.flat_map { |block| extract_fixtures_for_date(block) }
      end

      def looks_malformed?(html, doc)
        return true unless html.include?('<') && html.include?('>')
        return false if doc.css(DATE_BLOCK_SELECTOR).any?
        return false if doc.css(FIXTURE_ROW_SELECTOR).any?

        body = doc.at_css('body')
        body.nil? || body.text.strip.empty?
      end
      private_class_method :looks_malformed?

      def extract_fixtures_for_date(date_block)
        match_date = extract_match_date(date_block)
        return [] unless match_date

        leagues = date_block.css(LEAGUE_BLOCK_SELECTOR)
        leagues.flat_map do |league|
          league_name = extract_league_name(league)
          rows = league.css(FIXTURE_ROW_SELECTOR)
          rows.map { |row| build_fixture(row, match_date: match_date, league: league_name) }
        end.compact
      end
      private_class_method :extract_fixtures_for_date

      def extract_match_date(date_block)
        heading = date_block.at_css(DATE_HEADING_SELECTOR)
        return nil unless heading

        text = heading.text.gsub(/\s+/, ' ').strip
        Date.parse(text)
      rescue ArgumentError
        nil
      end
      private_class_method :extract_match_date

      def extract_league_name(league_block)
        header = league_block.at_css(LEAGUE_HEADER_SELECTOR)
        return nil unless header

        link = header.at_css('a')
        text = (link || header).text.gsub(/\s+/, ' ').strip
        text.empty? ? nil : text
      end
      private_class_method :extract_league_name

      def build_fixture(row, match_date:, league:)
        teams = row.css(TEAM_CELL_SELECTOR)
        return nil if teams.length < 2

        home_team = clean_text(teams[0])
        away_team = clean_text(teams[1])
        return nil if home_team.empty? || away_team.empty?

        ko_cell = row.at_css(KO_CELL_SELECTOR)
        return nil unless ko_cell

        ko_link = ko_cell.at_css(KO_LINK_SELECTOR)
        ko_time = extract_ko_time(ko_link, ko_cell)
        source_url = ko_link ? ko_link['href'] : nil

        country = extract_country(source_url)

        Fixture.new(
          match_date: match_date,
          ko_time: ko_time,
          home_team: home_team,
          away_team: away_team,
          league: league,
          source_url: source_url,
          country: country
        )
      end
      private_class_method :build_fixture

      def extract_ko_time(link, cell)
        raw =
          if link
            link.text
          else
            cell.text
          end
        match = raw.gsub(/\s+/, ' ').strip.match(HH_MM_REGEX)
        match ? match[1] : nil
      end
      private_class_method :extract_ko_time

      def extract_country(source_url)
        return nil if source_url.nil? || source_url.empty?

        m = source_url.match(COUNTRY_FROM_URL_REGEX)
        m ? m[1] : nil
      end
      private_class_method :extract_country

      def clean_text(node)
        node.text.gsub(/\s+/, ' ').strip
      end
      private_class_method :clean_text
    end
  end
end
