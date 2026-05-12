require 'date'
require_relative '../../lib/scraper/uk_time_helper'

RSpec.describe AdamStats::Scraper::UkTimeHelper do
  describe '.uk_bst?' do
    it 'returns false for January (winter)' do
      expect(described_class.uk_bst?(2026, 1, 15)).to be(false)
    end

    it 'returns true for July (deep summer)' do
      expect(described_class.uk_bst?(2026, 7, 15)).to be(true)
    end

    it 'returns false before last Sunday of March (BST start day)' do
      # 2026: last Sunday of March = 2026-03-29
      expect(described_class.uk_bst?(2026, 3, 28)).to be(false)
    end

    it 'returns true on last Sunday of March (BST starts)' do
      expect(described_class.uk_bst?(2026, 3, 29)).to be(true)
    end

    it 'returns true in May' do
      expect(described_class.uk_bst?(2026, 5, 12)).to be(true)
    end

    it 'returns true on last Saturday of October (BST still active)' do
      # 2026: last Sunday of October = 2026-10-25; so 2026-10-24 is Saturday = BST
      expect(described_class.uk_bst?(2026, 10, 24)).to be(true)
    end

    it 'returns false on last Sunday of October (BST ends, GMT resumes)' do
      # 2026: last Sunday of October = 2026-10-25
      expect(described_class.uk_bst?(2026, 10, 25)).to be(false)
    end

    it 'handles 2025 DST boundaries correctly' do
      # 2025: BST starts 2025-03-30, ends 2025-10-26
      expect(described_class.uk_bst?(2025, 3, 29)).to be(false)
      expect(described_class.uk_bst?(2025, 3, 30)).to be(true)
      expect(described_class.uk_bst?(2025, 10, 25)).to be(true)
      expect(described_class.uk_bst?(2025, 10, 26)).to be(false)
    end
  end

  describe '.to_utc' do
    it 'converts BST time (UTC+1) to UTC correctly' do
      # 21:30 BST = 20:30 UTC
      result = described_class.to_utc(Date.new(2026, 5, 12), '21:30')
      expect(result).to eq(Time.utc(2026, 5, 12, 20, 30, 0))
    end

    it 'converts GMT time (UTC+0) to UTC (same time)' do
      # 20:00 GMT = 20:00 UTC
      result = described_class.to_utc(Date.new(2026, 1, 15), '20:00')
      expect(result).to eq(Time.utc(2026, 1, 15, 20, 0, 0))
    end

    it 'handles midnight crossover (23:30 BST = 22:30 UTC, same day)' do
      result = described_class.to_utc(Date.new(2026, 5, 12), '23:30')
      expect(result).to eq(Time.utc(2026, 5, 12, 22, 30, 0))
    end

    it 'handles post-midnight UK (00:30 BST = 23:30 UTC previous day)' do
      # Copa do Brasil scenario: 21:30 BRT on 12/05 = 00:30 BST on 13/05 = 23:30 UTC on 12/05
      # adamchoi scrapes it as match_date=2026-05-13, ko_time=00:30
      result = described_class.to_utc(Date.new(2026, 5, 13), '00:30')
      expect(result).to eq(Time.utc(2026, 5, 12, 23, 30, 0))
    end

    it 'returns nil when ko_time is nil' do
      result = described_class.to_utc(Date.new(2026, 5, 12), nil)
      expect(result).to be_nil
    end

    it 'returns nil when ko_time is empty string' do
      result = described_class.to_utc(Date.new(2026, 5, 12), '')
      expect(result).to be_nil
    end

    it 'uses noon approximation (12:00 UK) when ko_time is nil via noon_fallback' do
      # BST: 12:00 BST = 11:00 UTC
      result = described_class.to_utc_or_noon(Date.new(2026, 5, 12), nil)
      expect(result).to eq(Time.utc(2026, 5, 12, 11, 0, 0))
    end

    it 'uses noon approximation in winter (12:00 GMT = 12:00 UTC)' do
      result = described_class.to_utc_or_noon(Date.new(2026, 1, 15), nil)
      expect(result).to eq(Time.utc(2026, 1, 15, 12, 0, 0))
    end
  end

  describe '.utc_to_uk_local (inverse of to_utc)' do
    it 'converts UTC to UK local in BST (UTC+1) — summer' do
      # 20:30 UTC = 21:30 BST (May 2026)
      utc = Time.utc(2026, 5, 12, 20, 30, 0)
      date, ko = described_class.utc_to_uk_local(utc)
      expect(date).to eq(Date.new(2026, 5, 12))
      expect(ko).to eq('21:30')
    end

    it 'converts UTC to UK local in GMT (UTC+0) — winter' do
      # 20:00 UTC = 20:00 GMT (January 2026)
      utc = Time.utc(2026, 1, 15, 20, 0, 0)
      date, ko = described_class.utc_to_uk_local(utc)
      expect(date).to eq(Date.new(2026, 1, 15))
      expect(ko).to eq('20:00')
    end

    it 'rolls date forward when UTC crosses midnight in BST' do
      # 23:30 UTC on 2026-05-12 = 00:30 BST on 2026-05-13
      utc = Time.utc(2026, 5, 12, 23, 30, 0)
      date, ko = described_class.utc_to_uk_local(utc)
      expect(date).to eq(Date.new(2026, 5, 13))
      expect(ko).to eq('00:30')
    end

    it 'is the inverse of to_utc (round-trip: to_utc → utc_to_uk_local)' do
      original_date = Date.new(2026, 5, 12)
      original_ko   = '21:30'
      utc = described_class.to_utc(original_date, original_ko)
      date, ko = described_class.utc_to_uk_local(utc)
      expect(date).to eq(original_date)
      expect(ko).to eq(original_ko)
    end

    it 'is the inverse of to_utc in GMT (winter round-trip)' do
      original_date = Date.new(2026, 12, 15)
      original_ko   = '19:45'
      utc = described_class.to_utc(original_date, original_ko)
      date, ko = described_class.utc_to_uk_local(utc)
      expect(date).to eq(original_date)
      expect(ko).to eq(original_ko)
    end
  end
end
