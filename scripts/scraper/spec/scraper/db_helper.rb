require_relative '../db/db_helper'

module ScraperDBHelper
  module_function

  def truncate_fixtures!
    conn = DBHelper.connect
    # CASCADE limpa dependentes (analysis_cache via FK) sem precisar conhecê-los.
    conn.query('TRUNCATE TABLE fixtures RESTART IDENTITY CASCADE')
    conn.close
  end

  def ensure_schema!
    return if schema_present?

    DBHelper.apply_all_migrations!
  end

  def schema_present?
    conn = DBHelper.connect
    result = conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name='fixtures'"
    ).first
    !result.nil?
  ensure
    conn&.close
  end

  def count_fixtures
    conn = DBHelper.connect
    n = conn.query('SELECT COUNT(*) AS n FROM fixtures').first['n'].to_i
    conn.close
    n
  end

  def fetch_fixtures
    conn = DBHelper.connect
    rows = conn.query('SELECT * FROM fixtures ORDER BY id').to_a
    conn.close
    rows
  end
end
