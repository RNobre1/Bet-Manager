-- ============================================================
-- LLM request logs — one row per /api/analyze or /api/copilot call.
-- Operational visibility: cost over time, latency distribution, error
-- rate, which model/route was used when. Independent from analysis_cache
-- (which only stores the visible answer) — these logs include misses,
-- errors, follow-ups and reasoner runs the cache deliberately ignores.
-- ============================================================

create table public.llm_request_logs (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  route             text        not null,            -- 'analyze' | 'copilot'
  fixture_id        bigint,                          -- analyze only; null for copilot
  model             text        not null,
  cached            boolean     not null default false,
  reasoner          boolean     not null default false,
  follow_up         boolean     not null default false,
  latency_ms        integer,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  hops              jsonb,                           -- copilot only — array of {tool, args, took_ms, result_summary}
  error             text
);

create index idx_llm_request_logs_created_at on public.llm_request_logs (created_at desc);
create index idx_llm_request_logs_route      on public.llm_request_logs (route);
create index idx_llm_request_logs_fixture    on public.llm_request_logs (fixture_id) where fixture_id is not null;

alter table public.llm_request_logs enable row level security;

create policy "llm_request_logs_select" on public.llm_request_logs
  for select to authenticated using (true);
-- Server-side admin client (service_role) writes; no authenticated INSERT policy needed.
