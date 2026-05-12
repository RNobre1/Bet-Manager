require 'pg'

module AdamStats
  module Scraper
    module DB
      module_function

      def connect
        url = ENV.fetch('DATABASE_URL')
        PG.connect(url)
      end

      def with_connection
        conn = connect
        yield conn
      ensure
        conn&.close
      end
    end
  end
end
