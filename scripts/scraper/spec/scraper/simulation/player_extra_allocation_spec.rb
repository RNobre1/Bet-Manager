require 'spec_helper'
require 'scraper/simulation/player_allocation'
require 'scraper/simulation/runner'

module AdamStats
  module Scraper
    module Simulation
      RSpec.describe 'F10 — player_extra outcome_odds_by_player blend' do
        it 'MODEL_VERSION reflete bump para v4' do
          expect(Runner::MODEL_VERSION).to eq('sim-v1-poisson-dc-nb-mc10k-v4')
        end

        describe PlayerAllocation, '.event_weight com :goals' do
          let(:base_player) do
            {
              'name' => 'Player A',
              'started' => 10, 'minutes' => 900,
              'goals' => 5, 'yellows' => 2, 'reds' => 0,
              'shots_on_target' => 18
            }
          end

          it 'sem anytime_scorer_odd ⇒ usa só peso histórico (degradação)' do
            w = PlayerAllocation.send(:event_weight, base_player, :goals)
            # rate=5/900 * expected_minutes(=min(900/10, 90)=90) = 0.5
            expect(w).to be_within(1e-6).of(0.5)
          end

          it 'com anytime_scorer_odd baixa (favorito mercado) ⇒ w > histórico' do
            p = base_player.merge('anytime_scorer_odd' => 2.0) # implicit p=0.5
            w = PlayerAllocation.send(:event_weight, p, :goals)
            # w_hist = 0.5; w_market = 0.5*90=45; blend = 0.7*0.5 + 0.3*45 = 13.85
            expect(w).to be_within(1e-3).of(13.85)
          end

          it 'com anytime_scorer_odd alta (longshot mercado) ⇒ w ≈ histórico' do
            p = base_player.merge('anytime_scorer_odd' => 50.0) # implicit p=0.02
            w = PlayerAllocation.send(:event_weight, p, :goals)
            # w_hist=0.5, w_market=0.02*90=1.8, blend = 0.7*0.5+0.3*1.8 = 0.89
            expect(w).to be_within(1e-3).of(0.89)
          end

          it 'odds inválidos (0, negativo, nil, NaN) ⇒ degrada pra histórico' do
            [0, -1, nil, Float::NAN, 'abc'].each do |bad|
              p = base_player.merge('anytime_scorer_odd' => bad)
              w = PlayerAllocation.send(:event_weight, p, :goals)
              expect(w).to be_within(1e-6).of(0.5),
                              "expected fallback to historic for odd=#{bad.inspect}, got #{w}"
            end
          end

          it 'metric :cards ignora anytime_scorer_odd (só goals usa)' do
            p = base_player.merge('anytime_scorer_odd' => 2.0)
            w = PlayerAllocation.send(:event_weight, p, :cards)
            # w_hist cards = (2+0)/900 * 90 = 0.2; sem blend
            expect(w).to be_within(1e-6).of(0.2)
          end

          it 'metric :sot ignora anytime_scorer_odd' do
            p = base_player.merge('anytime_scorer_odd' => 2.0)
            w = PlayerAllocation.send(:event_weight, p, :sot)
            # w_hist sot = 18/900 * 90 = 1.8; sem blend
            expect(w).to be_within(1e-6).of(1.8)
          end
        end

        describe Runner, '.simulate — propaga anytime_scorer_odd ao xi' do
          it 'anexa anytime_scorer_odd no hash do player quando outcome_odds_by_player tem o nome' do
            d = {
              'avgs' => {
                'home_home' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.0, 'num_matches' => 20, 'cornersFor' => 5, 'cardsFor' => 2, 'shotsOnTargetFor' => 4 },
                'away_away' => { 'avgGoalsFor' => 1.2, 'avgGoalsAg' => 1.1, 'num_matches' => 20, 'cornersFor' => 4, 'cardsFor' => 2, 'shotsOnTargetFor' => 3 }
              },
              'recent_matches' => { 'home' => [], 'away' => [] },
              'player_stats' => {
                'home' => {
                  'top_players' => [
                    { 'name' => 'Foo', 'started' => 10, 'minutes' => 900, 'goals' => 5, 'yellows' => 1, 'reds' => 0, 'shots_on_target' => 10 }
                  ]
                },
                'away' => {
                  'top_players' => [
                    { 'name' => 'Bar', 'started' => 10, 'minutes' => 900, 'goals' => 3, 'yellows' => 2, 'reds' => 0, 'shots_on_target' => 7 }
                  ]
                }
              },
              'player_extra' => {
                'outcome_odds_by_player' => {
                  'Foo' => { 'ANYTIME_SCORER' => 2.5 },
                  'Bar' => { 'ANYTIME_SCORER' => 6.0 }
                }
              }
            }

            captured = []
            allow(PlayerAllocation).to receive(:allocate_event).and_wrap_original do |orig, *args, **kwargs|
              captured << args[1] if args.size >= 2 # xi
              orig.call(*args, **kwargs)
            end

            res = Runner.simulate(d, n: 10) # n pequeno só pra exercitar caminho
            expect(res[:status]).to eq('pending')
            expect(res[:model_version]).to eq('sim-v1-poisson-dc-nb-mc10k-v4')

            # ao menos uma chamada com Foo no xi deve ter anytime_scorer_odd = 2.5
            foo_seen = captured.any? do |xi|
              p = xi.find { |x| x['name'] == 'Foo' }
              p && p['anytime_scorer_odd'] == 2.5
            end
            expect(foo_seen).to be(true)
          end

          it 'sem player_extra ⇒ xi sem anytime_scorer_odd (zero crashes)' do
            d = {
              'avgs' => {
                'home_home' => { 'avgGoalsFor' => 1.5, 'avgGoalsAg' => 1.0, 'num_matches' => 20, 'cornersFor' => 5, 'cardsFor' => 2, 'shotsOnTargetFor' => 4 },
                'away_away' => { 'avgGoalsFor' => 1.2, 'avgGoalsAg' => 1.1, 'num_matches' => 20, 'cornersFor' => 4, 'cardsFor' => 2, 'shotsOnTargetFor' => 3 }
              },
              'recent_matches' => { 'home' => [], 'away' => [] },
              'player_stats' => {
                'home' => { 'top_players' => [{ 'name' => 'Foo', 'started' => 10, 'minutes' => 900, 'goals' => 5, 'yellows' => 1, 'reds' => 0, 'shots_on_target' => 10 }] },
                'away' => { 'top_players' => [{ 'name' => 'Bar', 'started' => 10, 'minutes' => 900, 'goals' => 3, 'yellows' => 2, 'reds' => 0, 'shots_on_target' => 7 }] }
              }
              # player_extra ausente
            }
            res = Runner.simulate(d, n: 10)
            expect(res[:status]).to eq('pending')
            # nenhum player_events pode ter `anytime_scorer_odd` exposto
            res[:player_events].each do |pe|
              expect(pe).not_to have_key('anytime_scorer_odd')
              expect(pe).not_to have_key(:anytime_scorer_odd)
            end
          end
        end
      end
    end
  end
end
