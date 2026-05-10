-- ============================================================
-- Generic audit trigger: captures every INSERT/UPDATE/DELETE
-- on user-scoped tables into public.audit_log with before/after.
-- Source-of-truth lives in the database — app code cannot bypass.
-- ============================================================

create or replace function public.tg_audit_log()
returns trigger
security definer
set search_path = public
language plpgsql as $$
declare
  acting_user uuid := auth.uid();
  target_user uuid;
  before_row  jsonb;
  after_row   jsonb;
begin
  if (tg_op = 'DELETE') then
    target_user := old.user_id;
    before_row  := to_jsonb(old);
    after_row   := null;
  elsif (tg_op = 'UPDATE') then
    target_user := coalesce(new.user_id, old.user_id);
    before_row  := to_jsonb(old);
    after_row   := to_jsonb(new);
  else
    target_user := new.user_id;
    before_row  := null;
    after_row   := to_jsonb(new);
  end if;

  insert into public.audit_log (
    user_id, occurred_at, entity_type, entity_id, action, before, after, context
  ) values (
    coalesce(target_user, acting_user),
    now(),
    tg_table_name,
    coalesce(
      (case when tg_op = 'DELETE' then (before_row ->> 'id')::uuid
            else (after_row ->> 'id')::uuid end),
      null
    ),
    case tg_op
      when 'INSERT' then 'create'::audit_action
      when 'UPDATE' then 'update'::audit_action
      when 'DELETE' then 'delete'::audit_action
    end,
    before_row,
    after_row,
    jsonb_build_object('acting_user', acting_user)
  );

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

-- Attach to mutation-relevant tables
create trigger audit_houses
  after insert or update or delete on public.houses
  for each row execute function public.tg_audit_log();

create trigger audit_transactions
  after insert or delete on public.transactions  -- updates conceptually disallowed
  for each row execute function public.tg_audit_log();

create trigger audit_bets
  after insert or update or delete on public.bets
  for each row execute function public.tg_audit_log();

create trigger audit_bet_selections
  after insert or update or delete on public.bet_selections
  for each row execute function public.tg_audit_log();

create trigger audit_user_profile
  after update on public.user_profile
  for each row execute function public.tg_audit_log();

-- ============================================================
-- bet_events: auto-emit on bets.status transition
-- ============================================================
create or replace function public.tg_bets_emit_event()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.bet_events (
      bet_id, user_id, event_type, from_status, to_status, diff, trigger_source
    ) values (
      new.id, new.user_id, 'placed', null, new.status,
      jsonb_build_object('total_stake', new.total_stake,
                         'total_odds', new.total_odds,
                         'expected_return', new.expected_return),
      'manual'
    );
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.bet_events (
      bet_id, user_id, event_type, from_status, to_status, diff, trigger_source
    ) values (
      new.id, new.user_id,
      case
        when new.status in ('won','lost','half_won','half_lost','partially_void') then 'resolved'::bet_event_type
        when new.status = 'void' then 'voided'::bet_event_type
        when new.status = 'cashed_out' then 'cashed_out'::bet_event_type
        when new.status = 'pending' then 'reopened'::bet_event_type
        else 'edited'::bet_event_type
      end,
      old.status, new.status,
      jsonb_build_object('actual_return', new.actual_return),
      'manual'
    );
  elsif tg_op = 'UPDATE' then
    -- non-status mutation
    insert into public.bet_events (
      bet_id, user_id, event_type, from_status, to_status, diff, trigger_source
    ) values (
      new.id, new.user_id, 'edited', old.status, new.status,
      jsonb_build_object(
        'before', jsonb_build_object('total_stake', old.total_stake, 'note', old.note, 'tags', old.tags),
        'after',  jsonb_build_object('total_stake', new.total_stake, 'note', new.note, 'tags', new.tags)
      ),
      'manual'
    );
  end if;
  return new;
end;
$$;

create trigger bets_emit_event
  after insert or update on public.bets
  for each row execute function public.tg_bets_emit_event();

-- ============================================================
-- Append-only enforcement on transactions:
-- block UPDATE / DELETE > 24h; allow only correction via new tx.
-- ============================================================
create or replace function public.tg_transactions_immutable()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Transactions are immutable. Create a compensating entry instead.'
      using errcode = 'restrict_violation';
  end if;
  if tg_op = 'DELETE' then
    if old.created_at < now() - interval '24 hours' then
      raise exception 'Transactions older than 24h cannot be deleted; create a compensating entry instead.'
        using errcode = 'restrict_violation';
    end if;
  end if;
  return old;
end;
$$;

create trigger transactions_block_update
  before update on public.transactions
  for each row execute function public.tg_transactions_immutable();

create trigger transactions_guard_delete
  before delete on public.transactions
  for each row execute function public.tg_transactions_immutable();
