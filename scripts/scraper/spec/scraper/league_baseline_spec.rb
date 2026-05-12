require 'json'
require_relative '../../lib/scraper/league_baseline'
require_relative 'db_helper'

RSpec.describe AdamStats::Scraper::LeagueBaseline do
  before(:all) do
    ENV['DATABASE_URL'] = DBHelper.test_url
    ScraperDBHelper.ensure_schema!
  end

  before(:each) do
    ScraperDBHelper.truncate_fixtures!
  end

  def insert_with_detail(home:, away:, league:, trends:)
    conn = DBHelper.connect
    conn.exec_params(
      "INSERT INTO fixtures (match_date, ko_time, home_team, away_team, league, source_url, detail_json, status) " \
      "VALUES (CURRENT_DATE, '20:00', $1, $2, $3, $4, $5::jsonb, 'parsed') RETURNING id",
      [home, away, league, "/fixture/#{home}-#{away}", { 'trends' => trends }.to_json]
    ).first['id'].to_i.tap { conn.close }
  end

  describe '.recompute! / .for_league' do
    it 'computes per-league avg across home and away percentages for each stat label' do
      insert_with_detail(
        home: 'A', away: 'B', league: 'L1',
        trends: [{ 'label' => 'Over 2.5 Goals', 'home_percent' => 60, 'away_percent' => 80 }]
      )
      insert_with_detail(
        home: 'C', away: 'D', league: 'L1',
        trends: [{ 'label' => 'Over 2.5 Goals', 'home_percent' => 70, 'away_percent' => 50 }]
      )
      # different league should not pollute L1 baseline
      insert_with_detail(
        home: 'X', away: 'Y', league: 'L2',
        trends: [{ 'label' => 'Over 2.5 Goals', 'home_percent' => 10, 'away_percent' => 10 }]
      )

      described_class.recompute!
      baseline = described_class.for_league('L1')
      expect(baseline['Over 2.5 Goals'][:sample_size]).to eq(4)
      expect(baseline['Over 2.5 Goals'][:avg_percent]).to be_within(0.01).of(65.0)
    end

    it 'returns empty hash when no baselines were ever computed' do
      expect(described_class.for_league('Premier League')).to eq({})
    end

    it 'is idempotent — multiple recomputes leave the same data' do
      insert_with_detail(
        home: 'A', away: 'B', league: 'L1',
        trends: [{ 'label' => 'Foo', 'home_percent' => 40, 'away_percent' => 60 }]
      )
      described_class.recompute!
      first = described_class.for_league('L1')
      described_class.recompute!
      expect(described_class.for_league('L1')).to eq(first)
    end

    it 'ignores fixtures whose detail_json is null' do
      conn = DBHelper.connect
      conn.exec_params(
        "INSERT INTO fixtures (match_date, ko_time, home_team, away_team, league, status) " \
        "VALUES (CURRENT_DATE, '20:00', 'NO', 'JSON', 'L1', 'pending')"
      )
      conn.close
      expect { described_class.recompute! }.not_to raise_error
      expect(described_class.for_league('L1')).to eq({})
    end
  end
end
