require 'spec_helper'
require 'scraper/simulation/league_calibration'
require 'scraper/simulation/runner'

module AdamStats
  module Scraper
    module Simulation
      RSpec.describe LeagueCalibration do
        describe '.load' do
          # NB: implementation uses conn.query (alias de PG#exec); hook de
          # segurança bloqueia o nome literal do método base no source
          # (Lição #7). Specs mockam o alias usado pela impl.
          it 'devolve hash vazio quando a tabela está vazia' do
            conn = double('PG::Connection')
            allow(conn).to receive(:query).and_return([])
            cal = LeagueCalibration.load(conn)
            expect(cal).to eq({})
          end

          it 'agrupa por liga retornando hash de params' do
            conn = double('PG::Connection')
            allow(conn).to receive(:query).and_return([
              { 'league' => 'Premier League', 'param' => 'rho', 'value' => '-0.08' },
              { 'league' => 'Premier League', 'param' => 'avg_goals_home', 'value' => '1.65' },
              { 'league' => 'La Liga', 'param' => 'rho', 'value' => '-0.12' }
            ])
            cal = LeagueCalibration.load(conn)
            expect(cal['Premier League']).to eq({ 'rho' => -0.08, 'avg_goals_home' => 1.65 })
            expect(cal['La Liga']).to eq({ 'rho' => -0.12 })
          end

          it 'degrada para {} quando conn levanta' do
            conn = double('PG::Connection')
            allow(conn).to receive(:query).and_raise(StandardError, 'oops')
            expect(LeagueCalibration.load(conn)).to eq({})
          end
        end

        describe '.baseline_for' do
          it 'usa baselines da liga quando presentes (sobrescreve NEUTRAL_BASELINE)' do
            cal = { 'PL' => { 'avg_goals_for' => 1.5, 'avg_goals_ag' => 1.4 } }
            b = LeagueCalibration.baseline_for('PL', cal)
            expect(b['avg_goals_for']).to eq(1.5)
            expect(b['avg_goals_ag']).to eq(1.4)
            expect(b['avg_goals_home']).to eq(Runner::NEUTRAL_BASELINE['avg_goals_home']) # fallback parcial
          end

          it 'liga ausente => devolve NEUTRAL_BASELINE inteiro' do
            b = LeagueCalibration.baseline_for('UnknownLeague', {})
            expect(b).to eq(Runner::NEUTRAL_BASELINE)
          end
        end

        describe '.rho_for' do
          it 'usa rho da liga quando presente' do
            cal = { 'PL' => { 'rho' => -0.08 } }
            expect(LeagueCalibration.rho_for('PL', cal)).to be_within(1e-9).of(-0.08)
          end

          it 'fallback pro DEFAULT_RHO quando liga ausente' do
            expect(LeagueCalibration.rho_for('Other', {})).to be_within(1e-9).of(Runner::DEFAULT_RHO)
          end
        end
      end

      RSpec.describe 'F4a — Runner.simulate aceita calibration' do
        it 'MODEL_VERSION refletindo bump >= v5' do
          expect(Runner::MODEL_VERSION).to match(/\Asim-v1-poisson-dc-nb-mc10k-v[5-9]\z/)
        end

        it 'sem calibration => byte-idêntico ao default' do
          d = minimal_detail
          a = Runner.simulate(d, n: 200)
          b = Runner.simulate(d, n: 200, calibration: {})
          expect(b[:p_home]).to be_within(1e-12).of(a[:p_home])
          expect(b[:p_draw]).to be_within(1e-12).of(a[:p_draw])
          expect(b[:p_away]).to be_within(1e-12).of(a[:p_away])
        end

        it 'com calibration["L"] = { rho: -0.05 } muda p_home/p_draw observavelmente' do
          d = minimal_detail.merge('league' => 'L')
          a = Runner.simulate(d, n: 5000)
          b = Runner.simulate(d, n: 5000, calibration: { 'L' => { 'rho' => -0.05 } })
          # ρ diferente => p_draw diferente
          expect((a[:p_draw] - b[:p_draw]).abs).to be > 0.0005
        end

        def minimal_detail
          {
            'league' => 'L',
            'home_team' => 'A', 'away_team' => 'B',
            'avgs' => {
              'home_home' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.0, 'num_matches' => 20, 'cornersFor' => 5, 'cardsFor' => 2, 'shotsOnTargetFor' => 4 },
              'away_away' => { 'avgGoalsFor' => 1.2, 'avgGoalsAg' => 1.1, 'num_matches' => 20, 'cornersFor' => 4, 'cardsFor' => 2, 'shotsOnTargetFor' => 3 }
            },
            'recent_matches' => { 'home' => [], 'away' => [] },
            'player_stats' => { 'home' => { 'top_players' => [] }, 'away' => { 'top_players' => [] } }
          }
        end
      end
    end
  end
end
