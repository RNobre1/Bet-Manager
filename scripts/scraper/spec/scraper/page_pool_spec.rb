require_relative '../../lib/scraper/page_pool'

RSpec.describe AdamStats::Scraper::PagePool do
  it 'lends pages back to the pool after the block returns' do
    pool = described_class.new([:a, :b])
    seen = []
    4.times { pool.acquire { |p| seen << p } }
    expect(seen.uniq.sort).to eq(%i[a b])
    expect(pool.size).to eq(2)
  end

  it 'serves different pages to concurrent threads' do
    pool = described_class.new([:a, :b])
    gate = Queue.new
    threads = 2.times.map do
      Thread.new do
        pool.acquire do |p|
          gate.push(p)
          sleep 0.1
          p
        end
      end
    end
    pages = [gate.pop, gate.pop]
    expect(pages.sort).to eq(%i[a b])
    threads.each(&:join)
    expect(pool.size).to eq(2)
  end

  it 'blocks acquire when the pool is empty and resumes when released' do
    pool = described_class.new([:only])
    queue = Queue.new
    long = Thread.new { pool.acquire { sleep 0.15; queue.push(:long_done) } }
    sleep 0.02
    short = Thread.new { pool.acquire { queue.push(:short_done) } }

    order = [queue.pop, queue.pop]
    expect(order).to eq(%i[long_done short_done])
    [long, short].each(&:join)
  end

  it 'returns the page even if the block raises' do
    pool = described_class.new([:a])
    expect { pool.acquire { raise 'boom' } }.to raise_error('boom')
    expect(pool.size).to eq(1)
  end
end
