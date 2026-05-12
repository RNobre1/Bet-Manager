require 'playwright'
require_relative 'page_pool'

module AdamStats
  module Scraper
    class PlaywrightSession
      DEFAULT_USER_AGENT =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' \
        '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'.freeze

      DEFAULT_SIGNIN_URL = 'https://account.adamchoi.co.uk/signin/password_signin'.freeze
      SIGNIN_EMAIL_SELECTOR = '#email'.freeze
      SIGNIN_PASSWORD_SELECTOR = '#password'.freeze
      SIGNIN_SUBMIT_SELECTOR = 'button[type=submit]#btn-email-password-signin'.freeze
      SIGNIN_SUCCESS_URL_PATTERN = %r{/account(?:/|$|\?)}.freeze
      SIGNIN_TIMEOUT_MS = 20_000

      def initialize(
        cli_path: ENV['PLAYWRIGHT_CLI_EXECUTABLE_PATH'],
        user_agent: ENV.fetch('SCRAPER_USER_AGENT', DEFAULT_USER_AGENT),
        locale: 'en-GB',
        timezone_id: 'Europe/London',
        viewport: { width: 1366, height: 900 },
        email: ENV['ADAMCHOI_EMAIL'],
        password: ENV['ADAMCHOI_PASSWORD'],
        signin_url: ENV.fetch('ADAMCHOI_SIGNIN_URL', DEFAULT_SIGNIN_URL)
      )
        raise ArgumentError, 'PLAYWRIGHT_CLI_EXECUTABLE_PATH is not set' if cli_path.nil? || cli_path.empty?

        @cli_path = cli_path
        @user_agent = user_agent
        @locale = locale
        @timezone_id = timezone_id
        @viewport = viewport
        @email = email
        @password = password
        @signin_url = signin_url
      end

      def authenticated?
        !(@email.nil? || @email.to_s.empty? || @password.nil? || @password.to_s.empty?)
      end

      # Faz signin email+senha numa page já existente do contexto.
      # Retorna true se rodou o flow; false se as credenciais não estão configuradas.
      def perform_signin(page)
        return false unless authenticated?

        page.goto(@signin_url, waitUntil: 'domcontentloaded')
        page.fill(SIGNIN_EMAIL_SELECTOR, @email)
        page.fill(SIGNIN_PASSWORD_SELECTOR, @password)
        page.click(SIGNIN_SUBMIT_SELECTOR)
        page.wait_for_url(SIGNIN_SUCCESS_URL_PATTERN, timeout: SIGNIN_TIMEOUT_MS)
        true
      end

      def with_page
        with_pages(1) { |pages| yield pages.first }
      end

      def with_pages(count)
        ::Playwright.create(playwright_cli_executable_path: @cli_path) do |pw|
          pw.chromium.launch(headless: true) do |browser|
            context = browser.new_context(
              userAgent: @user_agent,
              locale: @locale,
              timezoneId: @timezone_id,
              viewport: @viewport
            )

            if authenticated?
              auth_page = context.new_page
              begin
                perform_signin(auth_page)
              ensure
                begin
                  auth_page.close
                rescue StandardError
                  # ignore close error — context.close cleans up
                end
              end
            end

            pages = Array.new(count) { context.new_page }
            begin
              yield pages
            ensure
              pages.each do |page|
                page.close if page.respond_to?(:close)
              rescue StandardError
                # ignore close errors — context.close handles dangling pages
              end
              context.close if context.respond_to?(:close)
            end
          end
        end
      end

      # Abre N páginas no mesmo BrowserContext e expõe um PagePool thread-safe.
      def with_page_pool(size:)
        with_pages(size) do |pages|
          yield PagePool.new(pages)
        end
      end
    end
  end
end
