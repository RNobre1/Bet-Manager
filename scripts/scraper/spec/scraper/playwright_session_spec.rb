require_relative '../../lib/scraper/playwright_session'

RSpec.describe AdamStats::Scraper::PlaywrightSession do
  let(:cli_path) { '/fake/playwright' }

  describe '#authenticated?' do
    it 'is false when email is blank' do
      session = described_class.new(cli_path: cli_path, email: nil, password: 'x')
      expect(session.authenticated?).to be(false)
    end

    it 'is false when password is blank' do
      session = described_class.new(cli_path: cli_path, email: 'a@b.c', password: '')
      expect(session.authenticated?).to be(false)
    end

    it 'is true when both email and password are set' do
      session = described_class.new(cli_path: cli_path, email: 'a@b.c', password: 'secret')
      expect(session.authenticated?).to be(true)
    end
  end

  describe '#perform_signin' do
    let(:page) { double('Page') }

    it 'is a no-op (returns false) when credentials are not configured' do
      session = described_class.new(cli_path: cli_path)
      expect(page).not_to receive(:goto)
      expect(session.perform_signin(page)).to be(false)
    end

    it 'fills email + password, submits, and waits for account redirect when configured' do
      session = described_class.new(
        cli_path: cli_path,
        email: 'me@example.com',
        password: 'secret123',
        signin_url: 'https://account.example/signin'
      )
      expect(page).to receive(:goto).with('https://account.example/signin', anything).ordered
      expect(page).to receive(:fill).with('#email', 'me@example.com').ordered
      expect(page).to receive(:fill).with('#password', 'secret123').ordered
      expect(page).to receive(:click).with('button[type=submit]#btn-email-password-signin').ordered
      expect(page).to receive(:wait_for_url).with(an_instance_of(Regexp), hash_including(timeout: kind_of(Integer))).ordered
      expect(session.perform_signin(page)).to be(true)
    end

    it 'never logs the raw password (sanity check against accidental warn/puts)' do
      session = described_class.new(
        cli_path: cli_path,
        email: 'me@example.com',
        password: 'super-secret-token-XYZ',
        signin_url: 'https://account.example/signin'
      )
      allow(page).to receive(:goto)
      allow(page).to receive(:fill)
      allow(page).to receive(:click)
      allow(page).to receive(:wait_for_url)

      expect { session.perform_signin(page) }.not_to output(/super-secret-token-XYZ/).to_stderr
    end
  end
end
