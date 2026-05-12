module AdamStats
  module Scraper
    # Pool thread-safe de páginas Playwright (geralmente abertas no mesmo
    # BrowserContext). N threads concorrentes pegam uma página via #acquire,
    # operam e a devolvem ao pool. Thread::Queue garante exclusão mútua e
    # bloqueia a thread chamadora quando o pool está vazio.
    class PagePool
      def initialize(pages)
        @queue = Thread::Queue.new
        pages.each { |p| @queue.push(p) }
      end

      def size
        @queue.length
      end

      def acquire
        page = @queue.pop
        begin
          yield page
        ensure
          @queue.push(page)
        end
      end
    end
  end
end
