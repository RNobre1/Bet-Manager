module AdamStats
  module Scraper
    EMPTY_PLAYER_AGGREGATES = {
      players_count: 0, minutes: 0,
      goals: 0, assists: 0,
      yellows: 0, reds: 0,
      total_shots: 0, shots_on_target: 0,
      fouls_committed: 0, fouls_drawn: 0,
      offsides: 0, tackles: 0,
      goals_1h: 0, goals_2h: 0, cards_1h: 0, cards_2h: 0
    }.freeze

    MatchDetail = Data.define(
      :trends,
      :team_record,
      :recent_matches,
      :h2h,
      :streaks,
      :predictions,
      :odds_summary,
      :player_stats,
      :referee_record,
      # Fundação Simulação — novos campos (itens 1-6)
      :avgs,
      :recent_all,
      :standings,
      :odds_devigged,
      :player_extra
    ) do
      def self.empty
        new(
          trends: [],
          team_record: { home: { overall: nil, home: nil }, away: { overall: nil, away: nil } },
          recent_matches: { home: [], away: [] },
          h2h: [],
          streaks: { home: [], away: [] },
          predictions: [],
          odds_summary: {},
          player_stats: {
            home: { aggregates: EMPTY_PLAYER_AGGREGATES.dup, top_players: [] },
            away: { aggregates: EMPTY_PLAYER_AGGREGATES.dup, top_players: [] }
          },
          referee_record: nil,
          avgs: { home_home: {}, home_overall: {}, away_away: {}, away_overall: {} },
          recent_all: { home: [], away: [] },
          standings: { home: {}, away: {} },
          odds_devigged: {},
          player_extra: { form: [], home_seasons: [], away_seasons: [], outcome_odds_by_player: {} }
        )
      end
    end
  end
end
