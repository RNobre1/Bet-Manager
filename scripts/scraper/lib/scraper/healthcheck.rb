require 'net/http'
require 'uri'

module AdamStats
  module Scraper
    module Healthcheck
      TIMEOUT_SECONDS = 5

      module_function

      def ping_start(url)
        ping(url ? "#{url}/start" : nil)
      end

      def ping_success(url)
        ping(url)
      end

      def ping_failure(url)
        ping(url ? "#{url}/fail" : nil)
      end

      def ping(url)
        return false if url.nil? || url.empty?

        uri = URI.parse(url)
        Net::HTTP.start(uri.host, uri.port,
                        use_ssl: uri.scheme == 'https',
                        open_timeout: TIMEOUT_SECONDS,
                        read_timeout: TIMEOUT_SECONDS) do |http|
          response = http.get(uri.request_uri)
          return response.is_a?(Net::HTTPSuccess)
        end
      rescue StandardError => e
        warn "[healthcheck] ping #{url} failed: #{e.class}: #{e.message}"
        false
      end
      private_class_method :ping
    end
  end
end
