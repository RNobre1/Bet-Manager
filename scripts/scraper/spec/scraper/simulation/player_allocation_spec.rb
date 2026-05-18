require_relative '../../../lib/scraper/simulation/player_allocation'

RSpec.describe AdamStats::Scraper::Simulation::PlayerAllocation do
  def player(name, started:, minutes:, goals: 0, yellows: 0, reds: 0, sot: 0, injured: false)
    {
      'name' => name, 'started' => started, 'minutes' => minutes,
      'goals' => goals, 'yellows' => yellows, 'reds' => reds,
      'shots_on_target' => sot, 'injured' => injured
    }
  end

  let(:roster) do
    [
      player('Keeper',  started: 30, minutes: 2700, goals: 0),
      player('DefA',    started: 28, minutes: 2520, goals: 2),
      player('DefB',    started: 27, minutes: 2400, goals: 1),
      player('DefC',    started: 26, minutes: 2300, goals: 0),
      player('DefD',    started: 25, minutes: 2200, goals: 1),
      player('MidA',    started: 29, minutes: 2600, goals: 4),
      player('MidB',    started: 24, minutes: 2100, goals: 3),
      player('MidC',    started: 22, minutes: 1900, goals: 2),
      player('FwdA',    started: 30, minutes: 2750, goals: 18),
      player('FwdB',    started: 23, minutes: 2000, goals: 9),
      player('FwdC',    started: 20, minutes: 1700, goals: 6),
      player('Sub1',    started: 5,  minutes: 600,  goals: 2),
      player('InjuredStar', started: 31, minutes: 2790, goals: 25, injured: true),
      player('Sub2',    started: 1,  minutes: 90,   goals: 0)
    ]
  end

  describe '.probable_xi' do
    it 'excludes injured players entirely' do
      xi = described_class.probable_xi(roster)
      expect(xi[:players].map { |p| p['name'] }).not_to include('InjuredStar')
    end

    it 'returns exactly 11 players ranked by started + minutes/league_mpg' do
      xi = described_class.probable_xi(roster)
      expect(xi[:players].length).to eq(11)
      expect(xi[:players].map { |p| p['name'] }).to include('FwdA', 'Keeper', 'MidA')
      expect(xi[:players].map { |p| p['name'] }).not_to include('Sub2')
    end

    it 'exposes a confidence (low/med/high) from the 11th vs 12th margin' do
      xi = described_class.probable_xi(roster)
      expect(%i[low med high]).to include(xi[:confidence])
    end

    it 'degrades to fewer-than-11 without raising when roster is short' do
      short = roster.first(7)
      xi = described_class.probable_xi(short)
      expect(xi[:players].length).to eq(7)
      expect(%i[low med high]).to include(xi[:confidence])
    end

    it 'returns empty/low confidence on empty roster (no raise)' do
      xi = described_class.probable_xi([])
      expect(xi[:players]).to eq([])
      expect(xi[:confidence]).to eq(:low)
    end
  end

  describe '.allocate_event' do
    let(:xi) { described_class.probable_xi(roster)[:players] }

    it 'is deterministic given a seeded rng' do
      r1 = Random.new(5)
      r2 = Random.new(5)
      a = Array.new(100) { described_class.allocate_event(r1, xi, metric: :goals) }
      b = Array.new(100) { described_class.allocate_event(r2, xi, metric: :goals) }
      expect(a).to eq(b)
    end

    it 'allocates a goal event proportionally to (goals/minutes)*expected_minutes' do
      rng = Random.new(2024)
      counts = Hash.new(0)
      20_000.times { counts[described_class.allocate_event(rng, xi, metric: :goals)] += 1 }
      # FwdA (18 goals, high minutes) must out-score the keeper (0 goals)
      expect(counts['FwdA']).to be > counts['Keeper']
      expect(counts['FwdA']).to be > counts['DefC']
    end

    it 'returns nil when no player has any rate for the metric' do
      rng = Random.new(1)
      no_card_xi = xi.map { |p| p.merge('yellows' => 0, 'reds' => 0) }
      expect(described_class.allocate_event(rng, no_card_xi, metric: :cards)).to be_nil
    end

    it 'supports cards via (yellows+reds)/minutes and sot via shots_on_target/minutes' do
      carded = [
        player('A', started: 30, minutes: 2700, yellows: 10, reds: 1),
        player('B', started: 30, minutes: 2700, yellows: 0, reds: 0)
      ]
      rng = Random.new(3)
      counts = Hash.new(0)
      5000.times { counts[described_class.allocate_event(rng, carded, metric: :cards)] += 1 }
      expect(counts['A']).to be > counts['B']
    end
  end
end
