-- ============================================================
-- Adam-stats integration — fixtures table
-- Scraped daily from choistats API. Retention ~3-4 days.
-- ============================================================

create table public.fixtures (
  id          bigserial primary key,
  match_date  date        not null,
  ko_time     time,
  home_team   text        not null,
  away_team   text        not null,
  league      text,
  source_url  text,
  detail_json jsonb,
  scraped_at  timestamptz not null default now(),
  status      text        not null default 'pending'
);

create unique index idx_fixtures_dedup       on public.fixtures (match_date, home_team, away_team);
create        index idx_fixtures_match_date  on public.fixtures (match_date);

alter table public.fixtures enable row level security;

-- Fixtures are reference data (same for every user). Authenticated users read.
-- Writes come from the scraper / API routes using the service_role key
-- (which bypasses RLS).
create policy "fixtures_read" on public.fixtures
  for select to authenticated using (true);
