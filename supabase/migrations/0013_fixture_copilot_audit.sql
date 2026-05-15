-- 0013_fixture_copilot_audit.sql
--
-- O fluxo /api/analyze (resumo pré-jogo cacheado) foi aposentado e
-- substituído pelo copilot do jogo agêntico (/api/fixture-copilot).
-- `llm_request_logs.route` é `text` sem CHECK/enum (migration 0012), então
-- gravar 'fixture-copilot' não exige DDL. Esta migration só registra a
-- deprecation de `analysis_cache` no histórico do schema (append-only —
-- a tabela NÃO é dropada para não reescrever o passado).

comment on table public.analysis_cache is
  'DEPRECATED 2026-05-15 — substituída pelo fluxo /api/fixture-copilot; mantida por histórico append-only';
