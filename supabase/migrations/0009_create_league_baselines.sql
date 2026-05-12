-- ============================================================
-- Adam-stats integration — pre-computed league statistical baselines.
-- One row per (league, stat_label). Recomputed on demand.
-- ============================================================

create table public.league_baselines (
  league       text        not null,
  stat_label   text        not null,
  sample_size  int         not null,
  avg_percent  real,
  computed_at  timestamptz not null default now(),
  primary key (league, stat_label)
);

create index idx_league_baselines_league on public.league_baselines (league);

alter table public.league_baselines enable row level security;

-- Reference data — authenticated users read.
create policy "league_baselines_read" on public.league_baselines
  for select to authenticated using (true);
