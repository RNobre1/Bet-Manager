-- ============================================================
-- Adam-stats integration — country slug on fixtures.
-- Extracted from source_url first path segment (e.g. "england" in
-- /fixture/123/england-premier-league-tottenham-vs-leeds).
-- Disambiguates leagues with identical names across countries
-- (e.g. "Premier League" England vs Ukraine).
-- ============================================================

alter table public.fixtures add column if not exists country text;

-- Backfill existing rows from source_url slug.
-- URL pattern: /fixture/<id>/<country>-<league-slug>-<home>-vs-<away>
update public.fixtures
set country = (regexp_match(source_url, '^/fixture/\d+/([^-]+)-'))[1]
where country is null
  and source_url is not null
  and source_url ~ '^/fixture/\d+/[a-z]';
