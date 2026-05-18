require_relative '../../../lib/scraper/simulation/score_model'

RSpec.describe AdamStats::Scraper::Simulation::ScoreModel do
  describe '.matrix' do
    it 'returns an (N+1)x(N+1) probability matrix that sums to ≈ 1.0' do
      m = described_class.matrix(1.4, 1.1, -0.10)
      expect(m).to be_a(Array)
      expect(m.length).to eq(m.first.length) # square
      total = m.flatten.sum
      expect(total).to be_within(1e-3).of(1.0)
      expect(m.flatten).to all(be >= 0)
    end

    it 'with rho = 0 reduces to pure independent Poisson (parity test)' do
      lh = 1.7
      la = 1.2
      m = described_class.matrix(lh, la, 0.0)

      pois = ->(k, lam) { (lam**k) * Math.exp(-lam) / (1..k).reduce(1, :*) }
      # Pure Poisson product for a few representative cells
      [[0, 0], [1, 0], [0, 1], [1, 1], [2, 3]].each do |i, j|
        expected = pois.call(i, lh) * pois.call(j, la)
        # Iterative pmf accumulation is numerically more stable than the direct
        # λ^k/k! form; agreement to ~1e-6 is the relevant precision here.
        expect(m[i][j]).to be_within(1e-6).of(expected)
      end
    end

    it 'applies the Dixon-Coles τ correction to exactly the 4 low cells' do
      lh = 1.3
      la = 1.0
      rho = -0.12
      m_corr = described_class.matrix(lh, la, rho)
      m_pois = described_class.matrix(lh, la, 0.0)

      tau00 = 1 - (lh * la * rho)
      tau01 = 1 + (lh * rho)
      tau10 = 1 + (la * rho)
      tau11 = 1 - rho

      expect(m_corr[0][0]).to be_within(1e-9).of(m_pois[0][0] * tau00)
      expect(m_corr[0][1]).to be_within(1e-9).of(m_pois[0][1] * tau01)
      expect(m_corr[1][0]).to be_within(1e-9).of(m_pois[1][0] * tau10)
      expect(m_corr[1][1]).to be_within(1e-9).of(m_pois[1][1] * tau11)

      # All other cells unchanged (only the 4 low cells touched)
      expect(m_corr[2][2]).to be_within(1e-9).of(m_pois[2][2])
      expect(m_corr[3][0]).to be_within(1e-9).of(m_pois[3][0])
    end

    it 'normalizes so the corrected matrix still sums to ≈ 1.0' do
      m = described_class.matrix(1.1, 0.9, -0.15)
      expect(m.flatten.sum).to be_within(1e-3).of(1.0)
    end

    it 'negative rho increases the draw mass vs pure Poisson (DC effect)' do
      lh = 1.2
      la = 1.2
      draw_corr = sum_draw(described_class.matrix(lh, la, -0.12))
      draw_pois = sum_draw(described_class.matrix(lh, la, 0.0))
      expect(draw_corr).to be > draw_pois
    end
  end

  def sum_draw(matrix)
    matrix.each_with_index.sum { |row, i| row[i] }
  end
end
