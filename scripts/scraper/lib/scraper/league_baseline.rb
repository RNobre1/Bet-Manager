require 'json'
require_relative 'db'

module AdamStats
  module Scraper
    # Calcula e expõe linhas de baseline por liga + stat_label, agregando
    # as % home/away de cada fixture parseada. Não é baseline histórico real
    # (todas as ligas só têm fixtures de hoje/amanhã), mas dá ao LLM uma
    # referência "média da liga neste recorte" para destacar outliers.
    module LeagueBaseline
      module_function

      # Reagrega todos os fixtures persistidos e faz upsert no league_baselines.
      # Idempotente — pode ser chamado após cada scrape.
      def recompute!
        rows = fetch_aggregated_rows
        AdamStats::Scraper::DB.with_connection do |conn|
          conn.query('TRUNCATE TABLE league_baselines')
          rows.each do |(league, label, sample, avg)|
            conn.exec_params(
              'INSERT INTO league_baselines (league, stat_label, sample_size, avg_percent) ' \
              'VALUES ($1, $2, $3, $4)',
              [league, label, sample, avg]
            )
          end
        end
        rows.length
      end

      # Devolve { stat_label => { avg_percent: Float, sample_size: Integer } }
      # para uma liga específica. Hash vazio se não houver baselines registrados.
      def for_league(league)
        return {} if league.nil? || league.empty?

        AdamStats::Scraper::DB.with_connection do |conn|
          result = conn.exec_params(
            'SELECT stat_label, sample_size, avg_percent FROM league_baselines WHERE league = $1',
            [league]
          )
          result.each_with_object({}) do |row, h|
            h[row['stat_label']] = {
              avg_percent: row['avg_percent']&.to_f,
              sample_size: row['sample_size'].to_i
            }
          end
        end
      end

      def fetch_aggregated_rows
        agg = Hash.new { |h, k| h[k] = { sum: 0.0, count: 0 } }
        AdamStats::Scraper::DB.with_connection do |conn|
          conn.query('SELECT league, detail_json FROM fixtures WHERE detail_json IS NOT NULL').each do |row|
            league = row['league']
            next if league.nil? || league.empty?

            detail = parse_detail(row['detail_json'])
            next unless detail.is_a?(Hash)

            trends = detail['trends'] || []
            next unless trends.is_a?(Array)

            trends.each do |trend|
              label = trend['label'] || trend[:label]
              next if label.nil? || label.empty?

              %w[home_percent away_percent].each do |key|
                value = trend[key] || trend[key.to_sym]
                next if value.nil?

                agg[[league, label]][:sum] += value.to_f
                agg[[league, label]][:count] += 1
              end
            end
          end
        end

        agg.map do |(league, label), data|
          [league, label, data[:count], (data[:sum] / data[:count]).round(2)]
        end
      end
      private_class_method :fetch_aggregated_rows

      def parse_detail(raw)
        JSON.parse(raw)
      rescue JSON::ParserError
        nil
      end
      private_class_method :parse_detail
    end
  end
end
