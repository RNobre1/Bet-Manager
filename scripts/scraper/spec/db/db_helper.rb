require 'pg'

module DBHelper
  module_function

  # Migrations directory at the repo root — `scripts/scraper/` lives 2 levels
  # below the abissal repo root.
  MIGRATIONS_DIR = File.expand_path('../../../../supabase/migrations', __dir__)

  # Only the fixtures-domain migrations (0007+) need to run against the test
  # DB. The 0001-0006 migrations belong to the Abissal banca/bets domain and
  # reference the auth.users schema that doesn't exist in a bare local
  # Postgres container.
  FIXTURE_MIGRATION_GLOB = /\A0(00[7-9]|0[1-9]\d|[1-9]\d\d)_/

  def test_url
    ENV.fetch(
      'DATABASE_URL_TEST',
      'postgres://adam:senha@localhost:5433/adam_stats_test'
    )
  end

  def connect
    PG.connect(test_url)
  end

  def reset_schema!
    conn = connect
    conn.query('DROP TABLE IF EXISTS league_baselines CASCADE')
    conn.query('DROP TABLE IF EXISTS analysis_cache CASCADE')
    conn.query('DROP TABLE IF EXISTS fixtures CASCADE')
    conn.close
  end

  # Supabase ships with anon/authenticated/service_role roles preinstalled.
  # On a bare Postgres container they don't exist, so the `to authenticated`
  # policy clauses in our migrations fail. Create them if missing.
  def ensure_supabase_roles!
    conn = connect
    %w[anon authenticated service_role].each do |role|
      conn.query(<<~SQL)
        DO $$ BEGIN
          IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '#{role}') THEN
            CREATE ROLE #{role} NOINHERIT NOLOGIN;
          END IF;
        END $$;
      SQL
    end
    conn.close
  end

  def apply_migration!(filename)
    path = File.join(MIGRATIONS_DIR, filename)
    sql = File.read(path)
    conn = connect
    conn.query(sql)
    conn.close
  end

  def apply_all_migrations!
    ensure_supabase_roles!
    Dir.glob(File.join(MIGRATIONS_DIR, '*.sql')).sort.each do |path|
      basename = File.basename(path)
      next unless basename.match?(FIXTURE_MIGRATION_GLOB)

      apply_migration!(basename)
    end
  end
end
