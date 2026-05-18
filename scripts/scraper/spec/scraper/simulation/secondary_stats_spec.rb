require_relative '../../../lib/scraper/simulation/secondary_stats'

RSpec.describe AdamStats::Scraper::Simulation::SecondaryStats do
  describe '.sample (Negative Binomial draw)' do
    it 'is deterministic given a seeded rng' do
      rng1 = Random.new(42)
      rng2 = Random.new(42)
      draws1 = Array.new(50) { described_class.sample(rng1, 5.0, 2.0) }
      draws2 = Array.new(50) { described_class.sample(rng2, 5.0, 2.0) }
      expect(draws1).to eq(draws2)
    end

    it 'produces non-negative integers' do
      rng = Random.new(7)
      draws = Array.new(200) { described_class.sample(rng, 4.0, 1.5) }
      expect(draws).to all(be_a(Integer))
      expect(draws).to all(be >= 0)
    end

    it 'has empirical mean ≈ requested mean over many draws' do
      rng = Random.new(123)
      mean = 6.0
      n = 40_000
      draws = Array.new(n) { described_class.sample(rng, mean, 3.0) }
      empirical = draws.sum.to_f / n
      expect(empirical).to be_within(0.15).of(mean)
    end

    it 'is overdispersed: variance > mean' do
      rng = Random.new(99)
      mean = 5.0
      n = 40_000
      draws = Array.new(n) { described_class.sample(rng, mean, 4.0) }
      m = draws.sum.to_f / n
      var = draws.sum { |x| (x - m)**2 }.to_f / n
      expect(var).to be > m
    end

    it 'degrades to a Poisson-like draw (still valid) when dispersion is nil/zero' do
      rng = Random.new(11)
      draws = Array.new(100) { described_class.sample(rng, 3.0, nil) }
      expect(draws).to all(be_a(Integer))
      expect(draws).to all(be >= 0)
    end
  end

  describe '.dispersion_from (estimate dispersion from per-match values)' do
    it 'estimates a positive dispersion when variance exceeds mean' do
      values = [2, 8, 1, 9, 3, 11, 0, 7, 5, 12]
      disp = described_class.dispersion_from(values)
      expect(disp).to be_a(Numeric)
      expect(disp).to be > 0
    end

    it 'returns nil for empty/degenerate input (underdispersed)' do
      expect(described_class.dispersion_from([])).to be_nil
      expect(described_class.dispersion_from([3, 3, 3, 3])).to be_nil
    end
  end
end
