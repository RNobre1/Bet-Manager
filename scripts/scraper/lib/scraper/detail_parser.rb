require 'nokogiri'
require_relative 'match_detail'

module AdamStats
  module Scraper
    module DetailParser
      STAT_ROW_SELECTOR =
        'tbody[data-ng-repeat*="stat in vm.stats"]'.freeze
      ALL_ROW_SELECTOR =
        'tr[data-ng-show*="all"]'.freeze
      HOMEAWAY_ROW_SELECTOR =
        'tr[data-ng-show*="homeaway"]'.freeze
      LABEL_SELECTOR = 'h4'.freeze
      PERCENT_REGEX = /(\d{1,3})\s*%/.freeze
      RATIO_REGEX = %r{\((\d+)\s*/\s*(\d+)\)}.freeze

      module_function

      def parse_detail(html, widgets: {})
        base = MatchDetail.empty
        from_html =
          if html.nil? || html.strip.empty?
            base
          else
            doc = Nokogiri::HTML(html)
            base.with(trends: extract_trends(doc))
          end
        WidgetMerger.merge(from_html, widgets)
      end

      def extract_trends(doc)
        doc.css(STAT_ROW_SELECTOR).filter_map do |stat|
          all_row = stat.at_css(ALL_ROW_SELECTOR)
          next unless all_row

          all_cells = all_row.css('> td')
          next if all_cells.length < 3

          label = all_cells[1].at_css(LABEL_SELECTOR)&.text&.strip
          next if label.nil? || label.empty?

          home_all = parse_percent_cell(all_cells[0])
          away_all = parse_percent_cell(all_cells[2])
          next unless home_all[:percent] && away_all[:percent]

          # "homeaway" row mostra recortes só dos jogos em casa do home e jogos fora do away
          home_recent = { percent: nil, ratio: nil }
          away_recent = { percent: nil, ratio: nil }
          ha_row = stat.at_css(HOMEAWAY_ROW_SELECTOR)
          if ha_row
            ha_cells = ha_row.css('> td')
            if ha_cells.length >= 3
              home_recent = parse_percent_cell(ha_cells[0])
              away_recent = parse_percent_cell(ha_cells[2])
            end
          end

          {
            label: label,
            home_percent: home_all[:percent],
            home_ratio: home_all[:ratio],
            away_percent: away_all[:percent],
            away_ratio: away_all[:ratio],
            home_recent_percent: home_recent[:percent],
            home_recent_ratio: home_recent[:ratio],
            away_recent_percent: away_recent[:percent],
            away_recent_ratio: away_recent[:ratio]
          }
        end
      end
      private_class_method :extract_trends

      def parse_percent_cell(cell)
        text = cell.text.gsub(/\s+/, ' ').strip
        percent = text[PERCENT_REGEX, 1]&.to_i
        ratio = text[RATIO_REGEX] && "#{Regexp.last_match(1)}/#{Regexp.last_match(2)}"
        { percent: percent, ratio: ratio }
      end
      private_class_method :parse_percent_cell

    end
  end
end

require_relative 'widget_merger'
