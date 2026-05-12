-- ============================================================
-- Adam-stats integration — absolute UTC kickoff timestamp on fixtures.
-- Used for BRT day-window queries (fixes the cross-midnight bug where
-- a 21:30 BRT game would be tagged with London's "tomorrow" date).
-- ============================================================

alter table public.fixtures add column if not exists kickoff_utc timestamptz;

create index if not exists idx_fixtures_kickoff_utc on public.fixtures (kickoff_utc);

-- Backfill: convert (match_date, ko_time) from UK local to UTC.
-- BST (UTC+1) applies between the last Sunday of March and the last
-- Sunday of October. Outside that range, UK = UTC (GMT).
-- When ko_time is NULL we use 12:00 UK local as an approximation.
update public.fixtures
set kickoff_utc = (
  with bst_boundaries as (
    select
      -- Last Sunday of March in the match year
      (date_trunc('year', match_date::timestamp) + interval '2 months'
       + ((27 - extract(dow from (date_trunc('year', match_date::timestamp) + interval '2 months' + interval '27 days'))::int % 7) || ' days')::interval
      )::date as bst_start,
      -- Last Sunday of October in the match year
      (date_trunc('year', match_date::timestamp) + interval '9 months'
       + ((27 - extract(dow from (date_trunc('year', match_date::timestamp) + interval '9 months' + interval '27 days'))::int % 7) || ' days')::interval
      )::date as bst_end
  ),
  effective_ko as (
    select coalesce(ko_time, '12:00:00'::time) as ko_local
  ),
  is_bst as (
    select match_date >= bst_boundaries.bst_start
       and match_date <  bst_boundaries.bst_end as bst
    from bst_boundaries
  )
  select
    (match_date + effective_ko.ko_local
      - (case when is_bst.bst then interval '1 hour' else interval '0' end)
    ) at time zone 'UTC'
  from effective_ko, is_bst
)
where kickoff_utc is null;
