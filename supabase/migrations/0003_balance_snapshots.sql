-- ============================================================
-- Balance computation + daily snapshot generator.
-- Snapshot row = consolidated state of one house at end of one day.
-- ============================================================

-- Function: compute current balance for one house --------------
-- Returns: balance, deposits, withdrawals, staked, returned, pending_stake
create or replace function public.house_balance(p_user_id uuid, p_house_id uuid)
returns table (
  balance              numeric(14, 2),
  deposits_to_date     numeric(14, 2),
  withdrawals_to_date  numeric(14, 2),
  staked_to_date       numeric(14, 2),
  returned_to_date     numeric(14, 2),
  pending_stake        numeric(14, 2)
)
language sql
stable
security invoker
as $$
  with tx as (
    select kind, direction, amount
    from public.transactions
    where user_id = p_user_id and house_id = p_house_id
  ),
  pending as (
    select coalesce(sum(total_stake), 0)::numeric(14, 2) as pending
    from public.bets
    where user_id = p_user_id and house_id = p_house_id and status = 'pending'
  )
  select
    coalesce(sum(case when direction = 'in'  then amount else 0 end), 0)::numeric(14, 2)
    - coalesce(sum(case when direction = 'out' then amount else 0 end), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where kind = 'deposit'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where kind = 'withdrawal'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where kind = 'bet_stake'), 0)::numeric(14, 2),
    coalesce(sum(amount) filter (where kind = 'bet_return'), 0)::numeric(14, 2),
    (select pending from pending)
  from tx;
$$;

-- Function: generate snapshots for a given date for all houses --
-- Idempotent: upserts on (user_id, house_id, snapshot_date).
create or replace function public.generate_balance_snapshots(p_date date default current_date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  rows_written int := 0;
  h record;
  b record;
begin
  for h in
    select id, user_id from public.houses where archived_at is null
  loop
    select * into b from public.house_balance(h.user_id, h.id);

    insert into public.balance_snapshots (
      user_id, house_id, snapshot_date, balance,
      deposits_to_date, withdrawals_to_date, staked_to_date,
      returned_to_date, pending_stake
    )
    values (
      h.user_id, h.id, p_date, b.balance,
      b.deposits_to_date, b.withdrawals_to_date, b.staked_to_date,
      b.returned_to_date, b.pending_stake
    )
    on conflict (user_id, house_id, snapshot_date)
    do update set
      balance              = excluded.balance,
      deposits_to_date     = excluded.deposits_to_date,
      withdrawals_to_date  = excluded.withdrawals_to_date,
      staked_to_date       = excluded.staked_to_date,
      returned_to_date     = excluded.returned_to_date,
      pending_stake        = excluded.pending_stake;

    rows_written := rows_written + 1;
  end loop;

  return rows_written;
end;
$$;

grant execute on function public.generate_balance_snapshots(date) to service_role;
grant execute on function public.house_balance(uuid, uuid) to authenticated;
