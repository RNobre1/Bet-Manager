require 'webmock/rspec'
require_relative '../../lib/scraper/healthcheck'

RSpec.describe AdamStats::Scraper::Healthcheck do
  let(:base_url) { 'https://hc-ping.com/abc-123' }

  before { stub_request(:get, /hc-ping\.com/).to_return(status: 200, body: 'OK') }

  describe '.ping_success' do
    it 'GETs the URL given by HEALTHCHECKS_URL env' do
      described_class.ping_success(base_url)
      expect(WebMock).to have_requested(:get, base_url)
    end

    it 'returns true on 200' do
      expect(described_class.ping_success(base_url)).to be(true)
    end

    it 'is a no-op when URL is nil or empty' do
      expect(described_class.ping_success(nil)).to be(false)
      expect(described_class.ping_success('')).to be(false)
      expect(WebMock).not_to have_requested(:get, /hc-ping\.com/)
    end
  end

  describe '.ping_failure' do
    it 'GETs URL + "/fail"' do
      described_class.ping_failure(base_url)
      expect(WebMock).to have_requested(:get, "#{base_url}/fail")
    end
  end

  describe 'network resilience' do
    it 'returns false on timeout without raising' do
      stub_request(:get, /hc-ping\.com/).to_timeout
      expect { described_class.ping_success(base_url) }.not_to raise_error
      expect(described_class.ping_success(base_url)).to be(false)
    end

    it 'returns false on connection error without raising' do
      stub_request(:get, /hc-ping\.com/).to_raise(SocketError.new('no DNS'))
      expect { described_class.ping_success(base_url) }.not_to raise_error
    end

    it 'returns false on non-2xx status' do
      stub_request(:get, /hc-ping\.com/).to_return(status: 500, body: 'err')
      expect(described_class.ping_success(base_url)).to be(false)
    end
  end
end
