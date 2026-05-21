require 'spec_helper'
require_relative '../../../lib/scraper/simulation/expected_goals'
require_relative '../../../lib/scraper/simulation/rates'
require_relative '../../../lib/scraper/simulation/runner'

module AdamStats
  module Scraper
    module Simulation
      RSpec.describe ExpectedGoals do
        describe '.xg_from_match' do
          it 'computa xG = 0.10*shots + 0.30*shots_on_target' do
            v = ExpectedGoals.xg_from_match(total_shots: 15, shots_on_target: 6)
            expect(v).to be_within(1e-6).of((0.10 * 15) + (0.30 * 6)) # = 3.3
          end

          it 'devolve nil para inputs ausentes/inválidos' do
            expect(ExpectedGoals.xg_from_match(total_shots: nil, shots_on_target: 5)).to be_nil
            expect(ExpectedGoals.xg_from_match(total_shots: -1, shots_on_target: 3)).to be_nil
            expect(ExpectedGoals.xg_from_match(total_shots: 'a', shots_on_target: 3)).to be_nil
          end
        end

        describe '.avg_xg_for_side' do
          let(:matches_home) do
            [
              { 'homeTotalShots' => 14, 'homeShotsOnTarget' => 6 },
              { 'homeTotalShots' => 18, 'homeShotsOnTarget' => 8 },
              { 'homeTotalShots' => 10, 'homeShotsOnTarget' => 3 }
            ]
          end

          it 'média de xG por jogos do lado home' do
            v = ExpectedGoals.avg_xg_for_side(matches_home, side: 'home')
            # xG individuais: 1.4+1.8=3.2; 1.8+2.4=4.2; 1.0+0.9=1.9 → soma 9.3 / 3 = 3.1
            expect(v).to be_within(1e-6).of(3.1)
          end

          it 'lado away usa awayTotalShots/awayShotsOnTarget' do
            matches = [
              { 'awayTotalShots' => 10, 'awayShotsOnTarget' => 4 },
              { 'awayTotalShots' => 12, 'awayShotsOnTarget' => 3 }
            ]
            v = ExpectedGoals.avg_xg_for_side(matches, side: 'away')
            # xG: 1.0+1.2=2.2; 1.2+0.9=2.1 → 2.15
            expect(v).to be_within(1e-6).of(2.15)
          end

          it 'devolve nil quando lista vazia ou todos os valores invalidos' do
            expect(ExpectedGoals.avg_xg_for_side([], side: 'home')).to be_nil
            expect(ExpectedGoals.avg_xg_for_side([{ 'foo' => 1 }], side: 'home')).to be_nil
          end
        end
      end

      RSpec.describe Rates, '.lambdas com use_xg_proxy' do
        let(:detail) do
          {
            'avgs' => {
              'home_home' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.0, 'num_matches' => 20 },
              'away_away' => { 'avgGoalsFor' => 1.2, 'avgGoalsAg' => 1.1, 'num_matches' => 20 }
            },
            'recent_matches' => {
              'home' => [
                { 'homeTotalShots' => 18, 'homeShotsOnTarget' => 8, 'awayTotalShots' => 10, 'awayShotsOnTarget' => 3 }
              ] * 5,
              'away' => [
                { 'awayTotalShots' => 12, 'awayShotsOnTarget' => 5, 'homeTotalShots' => 14, 'homeShotsOnTarget' => 6 }
              ] * 5
            }
          }
        end
        let(:league_avgs) { Runner::NEUTRAL_BASELINE }

        it 'sem use_xg_proxy comportamento NÃO MUDA (idêntico ao default atual)' do
          a = Rates.lambdas(detail, league_avgs)
          b = Rates.lambdas(detail, league_avgs, use_xg_proxy: false)
          expect(b[:home]).to be_within(1e-12).of(a[:home])
          expect(b[:away]).to be_within(1e-12).of(a[:away])
        end

        it 'com use_xg_proxy: true substitui avgGoalsFor pelo avg_xg de recent_matches' do
          a = Rates.lambdas(detail, league_avgs)
          b = Rates.lambdas(detail, league_avgs, use_xg_proxy: true)
          # As médias de xG (3.6 home, 2.7 away) são bem maiores que avgGoalsFor (1.5/1.2)
          # então b[:home] DEVE ser observavelmente maior que a[:home]
          expect(b[:home]).to be > a[:home]
        end

        it 'use_xg_proxy: true sem recent_matches utilizáveis cai no comportamento default' do
          d2 = detail.merge('recent_matches' => { 'home' => [], 'away' => [] })
          a = Rates.lambdas(d2, league_avgs)
          b = Rates.lambdas(d2, league_avgs, use_xg_proxy: true)
          expect(b[:home]).to be_within(1e-12).of(a[:home])
        end
      end

      RSpec.describe 'F7 — Runner.simulate aceita use_xg_proxy' do
        it 'MODEL_VERSION refletindo bump v6' do
          expect(Runner::MODEL_VERSION).to eq('sim-v1-poisson-dc-nb-mc10k-v6')
        end

        it 'sem use_xg_proxy ⇒ default (compat com pipeline atual)' do
          d = {
            'avgs' => {
              'home_home' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.0, 'num_matches' => 20, 'cornersFor' => 5, 'cardsFor' => 2, 'shotsOnTargetFor' => 4 },
              'away_away' => { 'avgGoalsFor' => 1.2, 'avgGoalsAg' => 1.1, 'num_matches' => 20, 'cornersFor' => 4, 'cardsFor' => 2, 'shotsOnTargetFor' => 3 }
            },
            'recent_matches' => { 'home' => [], 'away' => [] },
            'player_stats' => { 'home' => { 'top_players' => [] }, 'away' => { 'top_players' => [] } }
          }
          res = Runner.simulate(d, n: 200)
          expect(res[:status]).to eq('pending')
          expect(res[:model_version]).to eq('sim-v1-poisson-dc-nb-mc10k-v6')
        end
      end
    end
  end
end
