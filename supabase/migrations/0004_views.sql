-- ============================================================
-- Read-side views for dashboard queries.
-- Plain (non-materialized) views — Postgres recomputes on read,
-- which for our volume (~5k tx/year) is sub-50ms.
-- Promote to materialized later if a query becomes hot.
-- ============================================================

-- Per-house balance + activity summary -------------------------
create or replace view public.house_balance_view as
select
  h.id                                                 as house_id,
  h.user_id,
  h.name,
  h.slug,
  h.color_hex,
  h.archived_at,
  coalesce(sum(case when t.direction = 'in'  then t.amount end), 0)::numeric(14, 2)
  - coalesce(sum(case when t.direction = 'out' then t.amount end), 0)::numeric(14, 2)  as balance,
  coalesce(sum(t.amount) filter (where t.kind = 'deposit'),     0)::numeric(14, 2)    as deposits,
  coalesce(sum(t.amount) filter (where t.kind = 'withdrawal'),  0)::numeric(14, 2)    as withdrawals,
  coalesce(sum(t.amount) filter (where t.kind = 'bet_stake'),   0)::numeric(14, 2)    as staked,
  coalesce(sum(t.amount) filter (where t.kind = 'bet_return'),  0)::numeric(14, 2)    as returned,
  (select coalesce(sum(b.total_stake), 0)::numeric(14, 2)
   from public.bets b
   where b.user_id = h.user_id and b.house_id = h.id and b.status = 'pending')        as pending_stake,
  (select count(*) from public.bets b
   where b.user_id = h.user_id and b.house_id = h.id)                                  as bet_count
from public.houses h
left join public.transactions t on t.house_id = h.id and t.user_id = h.user_id
group by h.id, h.user_id, h.name, h.slug, h.color_hex, h.archived_at;

-- Bet summary per user -----------------------------------------
create or replace view public.bet_summary_view as
select
  user_id,
  count(*)                                              as total_bets,
  count(*) filter (where status = 'pending')            as pending_count,
  count(*) filter (where status = 'won')                as won_count,
  count(*) filter (where status = 'lost')               as lost_count,
  count(*) filter (where status = 'void')               as void_count,
  count(*) filter (where status in ('half_won','half_lost','partially_void'))         as partial_count,
  count(*) filter (where status = 'cashed_out')         as cashout_count,
  coalesce(sum(total_stake) filter (where status <> 'pending'), 0)::numeric(14, 2)    as resolved_staked,
  coalesce(sum(actual_return) filter (where status <> 'pending'), 0)::numeric(14, 2)  as resolved_returned,
  coalesce(sum(total_stake) filter (where status = 'pending'), 0)::numeric(14, 2)     as pending_stake
from public.bets
group by user_id;

-- Daily P/L per user (from snapshots) --------------------------
create or replace view public.daily_pl_view as
select
  user_id,
  snapshot_date,
  sum(balance)::numeric(14, 2)                                                       as total_balance,
  sum(deposits_to_date)::numeric(14, 2)                                              as deposits_to_date,
  sum(withdrawals_to_date)::numeric(14, 2)                                           as withdrawals_to_date,
  sum(staked_to_date)::numeric(14, 2)                                                as staked_to_date,
  sum(returned_to_date)::numeric(14, 2)                                              as returned_to_date,
  sum(pending_stake)::numeric(14, 2)                                                 as pending_stake,
  /* P/L = balance - (deposits - withdrawals); excludes capital movement */
  (sum(balance) - (sum(deposits_to_date) - sum(withdrawals_to_date)))::numeric(14, 2)
                                                                                     as cumulative_pl
from public.balance_snapshots
group by user_id, snapshot_date;

-- Grant select on views to authenticated (RLS still applies on underlying tables) --
grant select on public.house_balance_view  to authenticated;
grant select on public.bet_summary_view    to authenticated;
grant select on public.daily_pl_view       to authenticated;
