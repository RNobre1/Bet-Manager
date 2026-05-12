require 'json'
require_relative '../../lib/scraper/widget_merger'
require_relative '../../lib/scraper/match_detail'

RSpec.describe AdamStats::Scraper::WidgetMerger do
  WIDGET_DIR = File.expand_path('fixtures/widgets', __dir__)

  def load_widget(name)
    JSON.parse(File.read(File.join(WIDGET_DIR, "#{name}.json")))
  end

  let(:widgets) do
    {
      team_records: load_widget('team-records'),
      recent_results: load_widget('recent-results'),
      chances: load_widget('chances'),
      odds: load_widget('odds'),
      players: load_widget('players')
    }
  end

  let(:base) { AdamStats::Scraper::MatchDetail.empty.with(trends: [{ label: 'demo', home_percent: 50, away_percent: 50 }]) }
  let(:merged) { described_class.merge(base, widgets) }

  it 'preserves trends from base' do
    expect(merged.trends.first[:label]).to eq('demo')
  end

  describe 'team_record' do
    it 'extracts overall records for both teams (position, played, points, form)' do
      home_overall = merged.team_record[:home][:overall]
      expect(home_overall).to include(
        type: 'All',
        played: 35,
        points: 37,
        points_per_game: 1.1
      )
      expect(home_overall[:position]).to match(/\d+(st|nd|rd|th)/)
      expect(home_overall[:form]).to be_an(Array)
      expect(home_overall[:form].length).to be >= 1
    end

    it 'extracts home-only record for home team and away-only for away team' do
      expect(merged.team_record[:home][:home][:type]).to eq('Home')
      expect(merged.team_record[:away][:away][:type]).to eq('Away')
    end
  end

  describe 'recent_matches' do
    it 'extracts up to 10 home games for home team and 10 away games for away team' do
      expect(merged.recent_matches[:home]).to be_an(Array)
      expect(merged.recent_matches[:home].length).to be_between(1, 10)
      expect(merged.recent_matches[:away].length).to be_between(1, 10)
    end

    it 'each match has date_iso, teams, score and rich per-match stats' do
      match = merged.recent_matches[:home].first
      expect(match['date_iso']).to match(/\A\d{4}-\d{2}-\d{2}\z/)
      expect(match['home_team']).to be_a(String)
      expect(match['away_team']).to be_a(String)
      expect(match['homeGoalsFt']).to be_a(Integer)
      expect(match['awayGoalsFt']).to be_a(Integer)
      expect(match).to have_key('homeCorners')
      expect(match).to have_key('homeBookingPoints')
      expect(match).to have_key('homeTotalShots')
    end

    it 'each match also carries offsides, 1H/2H corners, tackles and yellow-reds (premium fields)' do
      match = merged.recent_matches[:home].first
      %w[homeOffsides awayOffsides
         homeCorners1h awayCorners1h
         homeCorners2h awayCorners2h
         homeTackles awayTackles
         homeYellowReds awayYellowReds].each do |key|
        expect(match).to have_key(key), "expected #{key.inspect} in recent_match"
      end
    end
  end

  describe 'h2h' do
    it 'returns last head-to-head matches' do
      expect(merged.h2h).to be_an(Array)
      expect(merged.h2h.length).to be >= 1
      expect(merged.h2h.first).to include('home_team', 'away_team', 'homeGoalsFt', 'awayGoalsFt')
    end
  end

  describe 'streaks' do
    it 'extracts per-team streak facts grouped by category' do
      expect(merged.streaks[:home]).to be_an(Array)
      expect(merged.streaks[:home].length).to be >= 1
      first = merged.streaks[:home].first
      expect(first).to include(:stat_type, :overall_perc, :home_perc, :away_perc, :group)
    end
  end

  describe 'predictions' do
    it 'returns up to 3 top predictions with chance and odds' do
      expect(merged.predictions).to be_an(Array)
      expect(merged.predictions.length).to be >= 1
      first = merged.predictions.first
      expect(first[:stat_type]).to be_a(String)
      expect(first[:chance]).to be_a(Numeric)
    end

    it 'strips HTML from streak descriptions inside predictions' do
      first = merged.predictions.first
      all_stats = first[:home_stats] + first[:away_stats]
      all_stats.each { |s| expect(s).not_to match(/<[a-z]/i) }
    end
  end

  describe 'odds_summary' do
    it 'maps each market name to its outcomes with decimal odds' do
      expect(merged.odds_summary).to be_a(Hash)
      expect(merged.odds_summary).not_to be_empty
      first_market = merged.odds_summary.values.first
      first_outcome = first_market.values.first
      expect(first_outcome[:decimal_odds]).to be_a(Numeric)
    end
  end

  describe 'player_stats (shots, fouls, offsides, etc)' do
    it 'is populated for home and away with aggregates + top players' do
      ps = merged.player_stats
      expect(ps).to be_a(Hash)
      expect(ps).to have_key(:home)
      expect(ps).to have_key(:away)
      expect(ps[:home]).to have_key(:aggregates)
      expect(ps[:home]).to have_key(:top_players)
    end

    it 'aggregates per-team include shots, shots on target, fouls, offsides, tackles, cards, goals, assists' do
      agg = merged.player_stats[:home][:aggregates]
      %i[total_shots shots_on_target fouls_committed fouls_drawn offsides tackles
         yellows reds goals assists goals_1h goals_2h cards_1h cards_2h
         minutes players_count].each { |k| expect(agg).to have_key(k) }
      expect(agg[:total_shots]).to be >= 0
      expect(agg[:players_count]).to be >= 1
    end

    it 'aggregates equal the sum of individual players for the corresponding side' do
      home_raw = widgets[:players]['homePlayers']
      expected_shots = home_raw.sum { |p| p['totalShots'].to_i }
      expected_offsides = home_raw.sum { |p| p['offsides'].to_i }
      expect(merged.player_stats[:home][:aggregates][:total_shots]).to eq(expected_shots)
      expect(merged.player_stats[:home][:aggregates][:offsides]).to eq(expected_offsides)
    end

    it 'returns up to 11 top players per side ordered by minutes desc' do
      tops = merged.player_stats[:home][:top_players]
      expect(tops).to be_an(Array)
      expect(tops.length).to be <= 11
      minutes = tops.map { |p| p[:minutes] }
      expect(minutes).to eq(minutes.sort.reverse)
    end

    it 'each top player exposes the canonical stat keys' do
      sample = merged.player_stats[:home][:top_players].first
      %i[name played started minutes goals assists yellows reds
         total_shots shots_on_target fouls_committed fouls_drawn
         offsides tackles goals_1h goals_2h cards_1h cards_2h].each do |k|
        expect(sample).to have_key(k), "expected key #{k.inspect} in top_player"
      end
    end

    it 'tolerates missing players widget gracefully' do
      result = described_class.merge(base, widgets.except(:players))
      expect(result.player_stats[:home][:aggregates][:players_count]).to eq(0)
      expect(result.player_stats[:home][:top_players]).to eq([])
    end
  end

  describe 'referee_record' do
    let(:referee_fixtures) do
      # 4 completed games, 1 future (status NS)
      [
        { 'id' => 100, 'status' => 'FT', 'homeBookingPoints' => 40, 'awayBookingPoints' => 30, 'homeYellowReds' => 0, 'awayYellowReds' => 0, 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } },
        { 'id' => 101, 'status' => 'FT', 'homeBookingPoints' => 50, 'awayBookingPoints' => 25, 'homeYellowReds' => 1, 'awayYellowReds' => 0, 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } },
        { 'id' => 102, 'status' => 'FT', 'homeBookingPoints' => 20, 'awayBookingPoints' => 45, 'homeYellowReds' => 0, 'awayYellowReds' => 1, 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } },
        { 'id' => 103, 'status' => 'FT', 'homeBookingPoints' => 35, 'awayBookingPoints' => 30, 'homeYellowReds' => 0, 'awayYellowReds' => 0, 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } },
        { 'id' => 104, 'status' => 'NS', 'homeBookingPoints' => 0, 'awayBookingPoints' => 0, 'homeYellowReds' => 0, 'awayYellowReds' => 0, 'referee' => { 'id' => 14343, 'name' => 'Marco Guida' } }
      ]
    end

    it 'aggregates booking points / yellow reds over COMPLETED games only and exposes the referee name' do
      result = described_class.merge(base, widgets.merge(referee_fixtures: referee_fixtures))
      rec = result.referee_record
      expect(rec[:name]).to eq('Marco Guida')
      expect(rec[:fixtures_count]).to eq(5)
      expect(rec[:completed]).to eq(4)
      # (40+30 + 50+25 + 20+45 + 35+30) / 4 = 275 / 4 = 68.75 total bp per game
      expect(rec[:avg_total_booking_points]).to be_within(0.05).of(68.75)
      # home avg = (40+50+20+35)/4 = 36.25; away avg = (30+25+45+30)/4 = 32.5
      expect(rec[:avg_home_booking_points]).to be_within(0.05).of(36.25)
      expect(rec[:avg_away_booking_points]).to be_within(0.05).of(32.5)
      # total yellow_reds = 2 across 4 completed
      expect(rec[:total_yellow_reds]).to eq(2)
    end

    it 'returns nil when referee_fixtures is missing or empty' do
      no_referee = described_class.merge(base, widgets.merge(referee_fixtures: nil))
      expect(no_referee.referee_record).to be_nil
      empty_referee = described_class.merge(base, widgets.merge(referee_fixtures: []))
      expect(empty_referee.referee_record).to be_nil
    end

    it 'handles the case where all fixtures are upcoming (no completed games to average)' do
      upcoming_only = referee_fixtures.map { |f| f.merge('status' => 'NS', 'homeBookingPoints' => 0, 'awayBookingPoints' => 0) }
      result = described_class.merge(base, widgets.merge(referee_fixtures: upcoming_only))
      rec = result.referee_record
      expect(rec[:name]).to eq('Marco Guida')
      expect(rec[:fixtures_count]).to eq(5)
      expect(rec[:completed]).to eq(0)
      expect(rec[:avg_total_booking_points]).to be_nil
    end
  end

  describe 'edge cases' do
    it 'returns the base detail unchanged when widgets is empty' do
      result = described_class.merge(base, {})
      expect(result.recent_matches).to eq(home: [], away: [])
      expect(result.h2h).to eq([])
      expect(result.streaks).to eq(home: [], away: [])
      expect(result.predictions).to eq([])
    end

    it 'tolerates nil widgets argument' do
      expect { described_class.merge(base, nil) }.not_to raise_error
    end

    it 'serializes the merged detail to JSON without errors' do
      expect { JSON.generate(merged.to_h) }.not_to raise_error
    end
  end
end
