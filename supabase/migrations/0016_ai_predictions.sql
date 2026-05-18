-- ============================================================
-- ai_predictions — captura a predição estruturada emitida pelo
-- fixture-copilot e reconcilia com o resultado real (pós-jogo).
-- Auto-contida: não depende de fixtures (sem FK rígida), sobrevive
-- à purga diária de 3-4 dias. service-role only (como llm_request_logs).
--
-- Numeração: este arquivo é 0016 porque 0014 (loop-banca) e 0015
-- (alertas) vêm de sub-projetos paralelos que serão mergeados na main
-- antes deste. A sequência final na main será 0013→0014→0015→0016,
-- sem gap. Não renumere este arquivo.
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

-- RLS: postura service-role-only intencional — igual a llm_request_logs (0012) e
-- fixture_copilot_audit (0013). Tabela de sistema interna: lida e escrita exclusivamente
-- pelo scraper Ruby e pelo Worker Cloudflare via service_role key (bypassa RLS).
-- Não há policy para authenticated/anon porque nenhum cliente público precisa de acesso
-- direto; o frontend consome apenas as views/endpoints expostos pela API.
grant select, insert, update on public.ai_predictions to service_role;
