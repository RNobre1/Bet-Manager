-- ============================================================
-- F5 — multi model_version dedup
--
-- Hoje, fid_uidx (fixture_id, kickoff_utc) e teams_uidx (home_team,
-- away_team, kickoff_utc) garantem 1 linha por fixture. Quando
-- MODEL_VERSION bumpa, o hook DELETE+INSERT sobrescreve o histórico
-- (lição: bump v4→v5 apaga v4). F5 amplia as duas chaves pra incluir
-- model_version, preservando histórico ao longo de bumps. O reader
-- (web) e o display (/calibracao) sabem agrupar/escolher por versão.
-- ============================================================

drop index if exists public.fixture_simulations_fid_uidx;
drop index if exists public.fixture_simulations_teams_uidx;

create unique index if not exists fixture_simulations_fid_uidx
  on public.fixture_simulations (fixture_id, kickoff_utc, model_version)
  where fixture_id is not null;

create unique index if not exists fixture_simulations_teams_uidx
  on public.fixture_simulations (home_team, away_team, kickoff_utc, model_version)
  where fixture_id is null;
