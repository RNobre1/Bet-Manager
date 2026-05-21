-- ============================================================
-- league_parameters — parâmetros calibrados POR LIGA do motor de
-- simulação (ρ Dixon-Coles, baselines de gols, K do shrinkage).
-- Substitui o `NEUTRAL_BASELINE` constante e o `RHO_BY_LEAGUE = {}`
-- vazio (POC 2026-05-21).
--
-- Numeração: 0020 segue 0019_model_calibration.
-- ============================================================

create table if not exists public.league_parameters (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  league          text        not null,
  param           text        not null check (param in ('rho','avg_goals_for','avg_goals_ag','avg_goals_home','avg_goals_away','K')),
  value           double precision not null,
  model_version   text        not null,
  effective_from  timestamptz not null default now(),
  effective_until timestamptz,
  n               integer     not null
);

create unique index if not exists league_parameters_active_unique_idx
  on public.league_parameters (league, param)
  where effective_until is null;

create index if not exists league_parameters_active_idx
  on public.league_parameters (league, param, model_version)
  where effective_until is null;

alter table public.league_parameters enable row level security;
grant select, insert, update on public.league_parameters to service_role;
