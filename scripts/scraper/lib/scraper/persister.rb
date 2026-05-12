require 'json'
require_relative 'db'
require_relative 'uk_time_helper'

module AdamStats
  module Scraper
    class PersistError < StandardError; end

    Stats = Data.define(:inserted, :updated, :failed)

    module Persister
      UPSERT_SQL = <<~SQL.freeze
        INSERT INTO fixtures
          (match_date, ko_time, home_team, away_team, league, source_url, country, detail_json, kickoff_utc, scraped_at, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz, now(), 'parsed')
        ON CONFLICT (match_date, home_team, away_team)
        DO UPDATE SET
          ko_time     = EXCLUDED.ko_time,
          league      = EXCLUDED.league,
          source_url  = EXCLUDED.source_url,
          country     = COALESCE(EXCLUDED.country, fixtures.country),
          detail_json = COALESCE(EXCLUDED.detail_json, fixtures.detail_json),
          kickoff_utc = EXCLUDED.kickoff_utc,
          scraped_at  = now(),
          status      = 'parsed'
        RETURNING (xmax = 0) AS inserted_flag
      SQL

      module_function

      def persist(fixtures, detail_json_by_source_url: {})
        inserted = 0
        updated  = 0

        DB.with_connection do |conn|
          conn.query('BEGIN')
          begin
            fixtures.each do |fixture|
              params = build_params(fixture, detail_json_by_source_url)
              row = conn.exec_params(UPSERT_SQL, params).first
              row['inserted_flag'] == 't' ? (inserted += 1) : (updated += 1)
            end
            conn.query('COMMIT')
          rescue StandardError => e
            conn.query('ROLLBACK')
            raise PersistError, e.message
          end
        end

        Stats.new(inserted: inserted, updated: updated, failed: 0)
      end

      def build_params(fixture, detail_map)
        detail = detail_map[fixture.source_url]
        # Compute kickoff_utc: (match_date + ko_time) interpreted as UK local → UTC.
        # Falls back to noon UK if ko_time is nil (approximation; marked in CLAUDE.md §16).
        utc = UkTimeHelper.to_utc_or_noon(fixture.match_date, fixture.ko_time)
        [
          fixture.match_date,
          fixture.ko_time,
          fixture.home_team,
          fixture.away_team,
          fixture.league,
          fixture.source_url,
          fixture.country,
          detail.nil? ? nil : JSON.generate(detail),
          utc&.strftime('%Y-%m-%d %H:%M:%S UTC')
        ]
      end
      private_class_method :build_params
    end
  end
end
