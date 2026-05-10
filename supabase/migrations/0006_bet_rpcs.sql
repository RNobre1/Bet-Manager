-- 0006_bet_rpcs.sql
-- Atomic bet placement and resolution.
-- Wraps the multi-table writes (bets + bet_selections + transactions) in a
-- single Postgres transaction so a partial failure cannot leave the ledger
-- inconsistent. The bet_events table is populated by the existing trigger
-- (tg_bets_emit_event), so these RPCs do not write to it directly.

-- ----------------------------------------------------------------------------
-- place_bet
-- ----------------------------------------------------------------------------
-- Payload shape:
-- {
--   "house_id": uuid,
--   "kind": "single" | "multiple" | "system",
--   "total_stake": numeric,                  -- > 0
--   "placed_at": timestamptz?,                -- defaults to now()
--   "note": text?,
--   "tags": text[]?,
--   "selections": [
--     {
--       "event_label": text,
--       "selection_label": text,
--       "odds": numeric,                      -- >= 1.01
--       "sport_id": uuid?,
--       "market_id": uuid?,
--       "event_date": timestamptz?
--     }, ...
--   ]
-- }
-- Returns the new bet id.
create or replace function public.place_bet(p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user            uuid := auth.uid();
  v_house_id        uuid;
  v_kind            bet_kind;
  v_total_stake     numeric;
  v_placed_at       timestamptz;
  v_note            text;
  v_tags            text[];
  v_selections      jsonb;
  v_bet_id          uuid := gen_random_uuid();
  v_total_odds      numeric := 1;
  v_selection       jsonb;
  v_position        int := 0;
  v_selection_count int;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  v_house_id    := (p_payload->>'house_id')::uuid;
  v_kind        := (p_payload->>'kind')::bet_kind;
  v_total_stake := (p_payload->>'total_stake')::numeric;
  v_placed_at   := coalesce((p_payload->>'placed_at')::timestamptz, now());
  v_note        := nullif(p_payload->>'note', '');
  v_tags        := coalesce(
                     (select array_agg(value)
                        from jsonb_array_elements_text(p_payload->'tags')),
                     array[]::text[]);
  v_selections  := p_payload->'selections';

  if v_house_id is null then
    raise exception 'house_id is required' using errcode = '22023';
  end if;

  if v_total_stake is null or v_total_stake <= 0 then
    raise exception 'total_stake must be > 0' using errcode = '22023';
  end if;

  if v_selections is null or jsonb_typeof(v_selections) <> 'array' then
    raise exception 'selections array is required' using errcode = '22023';
  end if;

  v_selection_count := jsonb_array_length(v_selections);

  if v_selection_count = 0 then
    raise exception 'at least one selection is required' using errcode = '22023';
  end if;

  if v_kind = 'single' and v_selection_count <> 1 then
    raise exception 'single bet must have exactly one selection'
      using errcode = '22023';
  end if;

  if v_kind in ('multiple','system') and v_selection_count < 2 then
    raise exception '% bet requires 2+ selections', v_kind
      using errcode = '22023';
  end if;

  -- combined odds = product of leg odds (true for singles + accumulators;
  -- system bets are stored at this aggregate odds for now and revisited
  -- when the system-bet UI lands)
  for v_selection in select * from jsonb_array_elements(v_selections) loop
    v_total_odds := v_total_odds * (v_selection->>'odds')::numeric;
  end loop;

  insert into public.bets (
    id, user_id, house_id, kind, status,
    total_stake, total_odds, expected_return,
    placed_at, note, tags
  ) values (
    v_bet_id, v_user, v_house_id, v_kind, 'pending',
    v_total_stake, round(v_total_odds, 4),
    round(v_total_stake * v_total_odds, 2),
    v_placed_at, v_note, v_tags
  );

  for v_selection in select * from jsonb_array_elements(v_selections) loop
    insert into public.bet_selections (
      user_id, bet_id, position_index,
      event_label, selection_label, odds,
      sport_id, market_id, event_date, status
    ) values (
      v_user, v_bet_id, v_position,
      coalesce(nullif(v_selection->>'event_label', ''), '—'),
      coalesce(nullif(v_selection->>'selection_label', ''), '—'),
      (v_selection->>'odds')::numeric,
      nullif(v_selection->>'sport_id', '')::uuid,
      nullif(v_selection->>'market_id', '')::uuid,
      nullif(v_selection->>'event_date', '')::timestamptz,
      'pending'
    );
    v_position := v_position + 1;
  end loop;

  insert into public.transactions (
    user_id, house_id, kind, direction, amount,
    occurred_at, related_bet_id, note
  ) values (
    v_user, v_house_id, 'bet_stake', 'out', v_total_stake,
    v_placed_at, v_bet_id, 'stake'
  );

  return v_bet_id;
end;
$$;

revoke all on function public.place_bet(jsonb) from public, anon;
grant execute on function public.place_bet(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- resolve_bet
-- ----------------------------------------------------------------------------
-- Resolves a pending bet, updates selection statuses to mirror the result
-- (won/lost), and emits the bet_return transaction (when the return > 0).
-- For 'won': actual_return defaults to expected_return.
-- For 'lost': actual_return defaults to 0.
-- For 'void': actual_return defaults to total_stake (refund).
-- For 'cashed_out' / 'half_won' / 'half_lost' / 'partially_void':
--   actual_return MUST be supplied by the caller.
create or replace function public.resolve_bet(
  p_bet_id        uuid,
  p_status        bet_status,
  p_actual_return numeric default null,
  p_resolved_at   timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user          uuid := auth.uid();
  v_bet           public.bets%rowtype;
  v_actual_return numeric;
  v_resolved_at   timestamptz := coalesce(p_resolved_at, now());
  v_selection_status bet_status;
begin
  if v_user is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  if p_status not in ('won','lost','void','cashed_out',
                      'half_won','half_lost','partially_void') then
    raise exception 'invalid resolution status: %', p_status
      using errcode = '22023';
  end if;

  select * into v_bet
    from public.bets
   where id = p_bet_id and user_id = v_user
   for update;

  if not found then
    raise exception 'bet not found' using errcode = 'P0002';
  end if;

  if v_bet.status <> 'pending' then
    raise exception 'bet already resolved (current: %)', v_bet.status
      using errcode = '22023';
  end if;

  if p_status in ('cashed_out','half_won','half_lost','partially_void')
     and p_actual_return is null then
    raise exception 'actual_return is required for status %', p_status
      using errcode = '22023';
  end if;

  v_actual_return := case
    when p_actual_return is not null then p_actual_return
    when p_status = 'won'  then v_bet.expected_return
    when p_status = 'lost' then 0
    when p_status = 'void' then v_bet.total_stake
    else 0
  end;

  if v_actual_return < 0 then
    raise exception 'actual_return cannot be negative' using errcode = '22023';
  end if;

  update public.bets
     set status        = p_status,
         actual_return = round(v_actual_return, 2),
         resolved_at   = v_resolved_at,
         updated_at    = now()
   where id = p_bet_id and user_id = v_user;

  -- Mirror status onto selections so per-leg displays stay consistent for
  -- single & multiple bets. For partial / cashed-out outcomes we leave them
  -- as 'pending' to be edited per-leg later (Phase 3.1 polish).
  v_selection_status := case
    when p_status = 'won'  then 'won'::bet_status
    when p_status = 'lost' then 'lost'::bet_status
    when p_status = 'void' then 'void'::bet_status
    else null
  end;

  if v_selection_status is not null then
    update public.bet_selections
       set status = v_selection_status
     where bet_id = p_bet_id and user_id = v_user;
  end if;

  if v_actual_return > 0 then
    insert into public.transactions (
      user_id, house_id, kind, direction, amount,
      occurred_at, related_bet_id, note
    ) values (
      v_user, v_bet.house_id, 'bet_return', 'in', v_actual_return,
      v_resolved_at, p_bet_id,
      'retorno (' || p_status::text || ')'
    );
  end if;
end;
$$;

revoke all on function public.resolve_bet(uuid, bet_status, numeric, timestamptz)
  from public, anon;
grant execute on function public.resolve_bet(uuid, bet_status, numeric, timestamptz)
  to authenticated;
