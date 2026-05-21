-- ============================================================
-- model_calibration — curva de calibração isotônica pós-modelo
-- por (metric, model_version). Aplicação fica a cargo do
-- consumidor; este schema só guarda o resultado do treino.
--
-- Numeração: 0019 segue 0018_fixture_simulations sem gap.
-- ============================================================

create table if not exists public.model_calibration (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  metric          text        not null check (metric in ('1x2-home','1x2-draw','1x2-away','over25')),
  model_version   text        not null,
  effective_from  timestamptz not null default now(),
  effective_until timestamptz,                          -- null = ativa
  pairs           jsonb       not null,                 -- array de [x,y]
  n               integer     not null                  -- amostras de treino
);

create index if not exists model_calibration_active_idx
  on public.model_calibration (metric, model_version)
  where effective_until is null;

alter table public.model_calibration enable row level security;
grant select, insert, update on public.model_calibration to service_role;
