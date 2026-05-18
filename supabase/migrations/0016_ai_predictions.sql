-- ============================================================
-- ai_predictions — captura a predição estruturada emitida pelo
-- fixture-copilot e reconcilia com o resultado real (pós-jogo).
-- Auto-contida: não depende de fixtures (sem FK rígida), sobrevive
-- à purga diária de 3-4 dias. service-role only (como llm_request_logs).
-- ============================================================

create table if not exists public.ai_predictions (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz  not null default now(),
  fixture_id            bigint,                                          -- nullable: fixture pode ter sido purgada
  route                 text         not null,                           -- 'fixture-copilot'
  model                 text,
  reasoner              boolean      not null default false,
  home_team             text         not null,
  away_team             text         not null,
  league                text,
  kickoff_utc           timestamptz,
  pred_winner           text         not null check (pred_winner in ('home','draw','away')),
  pred_confidence       numeric(4,3) not null check (pred_confidence between 0 and 1),
  pred_over_under       text         not null check (pred_over_under in ('over','under')),
  raw_excerpt           text,
  status                text         not null default 'pending'
                          check (status in ('pending','resolved','unresolvable')),
  actual_home_goals     int,
  actual_away_goals     int,
  actual_resolved_at    timestamptz,
  correct_winner        boolean,
  correct_over_under    boolean
);

create index if not exists ai_predictions_status_kickoff_idx
  on public.ai_predictions (status, kickoff_utc);

alter table public.ai_predictions enable row level security;

-- service-role only (igual llm_request_logs): sem policy para anon/authenticated.
-- O cliente admin (service_role) bypassa RLS — acesso de leitura/escrita apenas server-side.
grant select, insert, update on public.ai_predictions to service_role;
