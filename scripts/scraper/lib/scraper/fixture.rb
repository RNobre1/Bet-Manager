module AdamStats
  module Scraper
    Fixture = Data.define(
      :match_date,
      :ko_time,
      :home_team,
      :away_team,
      :league,
      :source_url,
      :country
    )
  end
end
