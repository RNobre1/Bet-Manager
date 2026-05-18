-- ============================================================
-- fixture_simulations — simulação pré-jogo pré-computada (placar +
-- stats secundárias + camada por jogador) gerada pelo scraper Ruby
-- (Poisson + Dixon-Coles + Negative Binomial + Monte Carlo 10k) e
-- reconciliada com o resultado real (pós-jogo).
--
-- Numeração: este arquivo é 0018 porque 0017_fixture_badges.sql é o
-- último livre na sequência atual da main (0013→…→0017→0018, sem gap).
-- Não renumere este arquivo.
--
-- Auto-contida (SEM FK rígida para `fixtures`): a tabela `fixtures`
-- sofre purga diária de 3-4 dias; uma FK rígida apagaria a simulação
-- junto com a fixture e mataria a calibração histórica. Guardamos
-- home_team/away_team/league/kickoff_utc para sobreviver à purga e
-- ainda reconciliar/medir Brier. Mesma postura de ai_predictions (0016).
--
-- Os campos jsonb (top_scorelines/sim_stats/market_anchor/player_events)
-- são SEMPRE escalares pequenos agregados — JAMAIS o blob de simulação
-- cru (proteção contra reabrir a outage 1101 do Worker; só escalares
-- cruzam o fio).
-- ============================================================

create table if not exists public.fixture_simulations (
  id                    bigint generated always as identity primary key,
  created_at            timestamptz  not null default now(),
  fixture_id            bigint,                                          -- nullable: fixture pode ter sido purgada
  home_team             text         not null,
  away_team             text         not null,
  league                text,
  kickoff_utc           timestamptz,
  model_version         text         not null,
  p_home                numeric(5,4),
  p_draw                numeric(5,4),
  p_away                numeric(5,4),
  p_btts                numeric(5,4),
  p_over_25             numeric(5,4),
  top_scorelines        jsonb,                                           -- escalar pequeno
  sim_stats             jsonb,                                           -- p10/p50/p90 por métrica/time/tempo
  per_half_available    boolean,
  market_anchor         jsonb,                                           -- odds devigadas p/ comparação (NÃO input)
  player_events         jsonb,                                           -- por jogador: P(gol)/P(cartão)/flag titular
  status                text         not null default 'pending'
                          check (status in ('pending','resolved','unsimulable','unresolvable')),
  actual_home_goals     int,
  actual_away_goals     int,
  correct_winner        boolean,
  correct_over_under    boolean,
  actual_resolved_at    timestamptz
);

create index if not exists fixture_simulations_status_kickoff_idx
  on public.fixture_simulations (status, kickoff_utc);

alter table public.fixture_simulations enable row level security;

-- RLS: postura service-role-only intencional — idêntica a ai_predictions
-- (0016), llm_request_logs (0012) e fixture_copilot_audit (0013). Tabela de
-- sistema interna: lida e escrita exclusivamente pelo scraper Ruby e pelo
-- Worker Cloudflare via service_role key (bypassa RLS). Não há policy para
-- authenticated/anon porque nenhum cliente público acessa direto; o
-- frontend consome apenas as views/endpoints expostos pela API.
grant select, insert, update on public.fixture_simulations to service_role;
