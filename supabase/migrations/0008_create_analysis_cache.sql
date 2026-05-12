-- ============================================================
-- Adam-stats integration — LLM analysis cache.
-- Key: content_hash (sha256 of the prompt+model+detail_json input).
-- ============================================================

create table public.analysis_cache (
  id            bigserial primary key,
  fixture_id    bigint      not null references public.fixtures(id) on delete cascade,
  content_hash  text        not null,
  response_json jsonb       not null,
  created_at    timestamptz not null default now()
);

create unique index idx_analysis_cache_hash       on public.analysis_cache (content_hash);
create        index idx_analysis_cache_fixture    on public.analysis_cache (fixture_id);
create        index idx_analysis_cache_created_at on public.analysis_cache (created_at);

alter table public.analysis_cache enable row level security;

-- Cache is read+write by authenticated users (single-user MVP).
-- Server routes using service_role bypass RLS for backfill / cron pruning.
create policy "analysis_cache_select" on public.analysis_cache
  for select to authenticated using (true);
create policy "analysis_cache_insert" on public.analysis_cache
  for insert to authenticated with check (true);
