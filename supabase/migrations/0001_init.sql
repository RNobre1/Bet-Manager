-- ============================================================
-- Abissal — schema inicial
-- Single-user no MVP, multi-tenant pronto via RLS por user_id.
-- Money: numeric(14,2). Append-only para transactions e bets.
-- ============================================================

-- Extensions ---------------------------------------------------
create extension if not exists "pgcrypto";

-- Enums --------------------------------------------------------
create type transaction_kind as enum (
  'deposit',
  'withdrawal',
  'bet_stake',
  'bet_return',
  'bonus_credit',
  'bonus_rollover',
  'fee',
  'adjustment_credit',
  'adjustment_debit',
  'transfer_in',
  'transfer_out'
);

create type transaction_direction as enum ('in', 'out');

create type bet_kind as enum ('single', 'multiple', 'system');

create type bet_status as enum (
  'pending',
  'won',
  'lost',
  'void',
  'cashed_out',
  'half_won',
  'half_lost',
  'partially_void'
);

create type bet_event_type as enum (
  'placed',
  'edited',
  'resolved',
  'voided',
  'cashed_out',
  'reopened'
);

create type audit_action as enum (
  'create',
  'update',
  'delete',
  'soft_delete',
  'restore'
);

-- Reference tables ---------------------------------------------
create table public.sports (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  created_at  timestamptz default now()
);

create table public.markets (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

-- User profile -------------------------------------------------
create table public.user_profile (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  default_currency char(3) not null default 'BRL',
  timezone         text not null default 'America/Sao_Paulo',
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Houses -------------------------------------------------------
create table public.houses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  slug         text not null,
  color_hex    text,
  website_url  text,
  notes_md     text,
  archived_at  timestamptz,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now(),
  unique (user_id, slug)
);

create index houses_user_id_idx on public.houses(user_id);
create index houses_user_active_idx on public.houses(user_id) where archived_at is null;

-- Bets (created before transactions for FK reference) ----------
create table public.bets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  house_id        uuid not null references public.houses(id) on delete restrict,
  kind            bet_kind not null,
  status          bet_status not null default 'pending',
  total_stake     numeric(14, 2) not null check (total_stake > 0),
  total_odds      numeric(10, 4) not null check (total_odds > 0),
  expected_return numeric(14, 2) not null check (expected_return > 0),
  actual_return   numeric(14, 2) check (actual_return is null or actual_return >= 0),
  placed_at       timestamptz not null default now(),
  resolved_at     timestamptz,
  note            text,
  tags            text[] default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  constraint bets_resolved_consistency check (
    (status = 'pending' and actual_return is null and resolved_at is null)
    or (status <> 'pending' and actual_return is not null and resolved_at is not null)
  )
);

create index bets_user_id_idx        on public.bets(user_id);
create index bets_house_id_idx       on public.bets(house_id);
create index bets_status_idx         on public.bets(user_id, status);
create index bets_placed_at_idx      on public.bets(user_id, placed_at desc);
create index bets_pending_idx        on public.bets(user_id) where status = 'pending';

-- Bet selections -----------------------------------------------
create table public.bet_selections (
  id              uuid primary key default gen_random_uuid(),
  bet_id          uuid not null references public.bets(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  sport_id        uuid references public.sports(id),
  market_id       uuid references public.markets(id),
  event_label     text not null,
  event_date      timestamptz,
  selection_label text not null,
  odds            numeric(10, 4) not null check (odds > 1),
  status          bet_status not null default 'pending',
  position_index  int not null default 0,
  created_at      timestamptz default now()
);

create index bet_selections_bet_id_idx  on public.bet_selections(bet_id);
create index bet_selections_user_id_idx on public.bet_selections(user_id);

-- Bet events (state transitions) — APPEND-ONLY -----------------
create table public.bet_events (
  id             uuid primary key default gen_random_uuid(),
  bet_id         uuid not null references public.bets(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  occurred_at    timestamptz not null default now(),
  event_type     bet_event_type not null,
  from_status    bet_status,
  to_status      bet_status,
  diff           jsonb default '{}'::jsonb,
  trigger_source text not null default 'manual'
);

create index bet_events_bet_id_idx     on public.bet_events(bet_id, occurred_at desc);
create index bet_events_user_id_idx    on public.bet_events(user_id, occurred_at desc);

-- Transactions — APPEND-ONLY core financial ledger -------------
create table public.transactions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  house_id               uuid not null references public.houses(id) on delete restrict,
  kind                   transaction_kind not null,
  direction              transaction_direction not null,
  amount                 numeric(14, 2) not null check (amount > 0),
  currency               char(3) not null default 'BRL',
  occurred_at            timestamptz not null default now(),
  related_bet_id         uuid references public.bets(id) on delete restrict,
  related_transaction_id uuid references public.transactions(id) on delete restrict,
  note                   text,
  metadata               jsonb default '{}'::jsonb,
  created_at             timestamptz default now(),
  -- bet_stake / bet_return must reference a bet
  constraint tx_bet_link_required check (
    (kind in ('bet_stake', 'bet_return') and related_bet_id is not null)
    or (kind not in ('bet_stake', 'bet_return'))
  ),
  -- transfer pairs must reference each other (relaxed: only enforce on transfer_in)
  constraint tx_transfer_link_required check (
    (kind = 'transfer_in' and related_transaction_id is not null)
    or (kind <> 'transfer_in')
  ),
  -- direction must match the kind
  constraint tx_direction_consistency check (
    (kind in ('deposit', 'bet_return', 'bonus_credit', 'bonus_rollover',
              'adjustment_credit', 'transfer_in') and direction = 'in')
    or
    (kind in ('withdrawal', 'bet_stake', 'fee', 'adjustment_debit',
              'transfer_out') and direction = 'out')
  )
);

create index tx_user_id_idx          on public.transactions(user_id);
create index tx_user_occurred_idx    on public.transactions(user_id, occurred_at desc);
create index tx_house_id_idx         on public.transactions(house_id);
create index tx_house_occurred_idx   on public.transactions(house_id, occurred_at desc);
create index tx_related_bet_idx      on public.transactions(related_bet_id) where related_bet_id is not null;
create index tx_kind_idx             on public.transactions(user_id, kind);

-- Balance snapshots --------------------------------------------
create table public.balance_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  house_id             uuid not null references public.houses(id) on delete cascade,
  snapshot_date        date not null,
  balance              numeric(14, 2) not null,
  deposits_to_date     numeric(14, 2) not null default 0,
  withdrawals_to_date  numeric(14, 2) not null default 0,
  staked_to_date       numeric(14, 2) not null default 0,
  returned_to_date     numeric(14, 2) not null default 0,
  pending_stake        numeric(14, 2) not null default 0,
  created_at           timestamptz default now(),
  unique (user_id, house_id, snapshot_date)
);

create index snapshots_user_date_idx on public.balance_snapshots(user_id, snapshot_date desc);

-- Audit log — APPEND-ONLY --------------------------------------
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  occurred_at  timestamptz not null default now(),
  entity_type  text not null,
  entity_id    uuid,
  action       audit_action not null,
  before       jsonb,
  after        jsonb,
  context      jsonb default '{}'::jsonb
);

create index audit_user_idx     on public.audit_log(user_id, occurred_at desc);
create index audit_entity_idx   on public.audit_log(entity_type, entity_id, occurred_at desc);

-- ============================================================
-- updated_at trigger (generic)
-- ============================================================
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profile_updated  before update on public.user_profile
  for each row execute function public.tg_set_updated_at();
create trigger houses_updated        before update on public.houses
  for each row execute function public.tg_set_updated_at();
create trigger bets_updated          before update on public.bets
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- Row Level Security — owner-by-user_id
-- ============================================================
alter table public.user_profile      enable row level security;
alter table public.houses            enable row level security;
alter table public.bets              enable row level security;
alter table public.bet_selections    enable row level security;
alter table public.bet_events        enable row level security;
alter table public.transactions      enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.audit_log         enable row level security;

alter table public.sports  enable row level security;
alter table public.markets enable row level security;

-- Reference tables: read-only to any authenticated user
create policy "ref_sports_read"  on public.sports  for select to authenticated using (true);
create policy "ref_markets_read" on public.markets for select to authenticated using (true);

-- Owner CRUD for user-scoped tables
do $$
declare t text;
begin
  for t in select unnest(array[
    'user_profile', 'houses', 'bets', 'bet_selections', 'bet_events',
    'transactions', 'balance_snapshots', 'audit_log'
  ])
  loop
    -- user_profile uses user_id as PK column
    if t = 'user_profile' then
      execute format($p$
        create policy "%1$s_select" on public.%1$I for select to authenticated using (auth.uid() = user_id);
        create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id);
        create policy "%1$s_update" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
      $p$, t);
    elsif t in ('audit_log', 'bet_events') then
      -- append-only: no update/delete via PostgREST
      execute format($p$
        create policy "%1$s_select" on public.%1$I for select to authenticated using (auth.uid() = user_id);
        create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id);
      $p$, t);
    elsif t = 'transactions' then
      -- transactions are append-only too
      execute format($p$
        create policy "%1$s_select" on public.%1$I for select to authenticated using (auth.uid() = user_id);
        create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id);
      $p$, t);
    else
      execute format($p$
        create policy "%1$s_select" on public.%1$I for select to authenticated using (auth.uid() = user_id);
        create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (auth.uid() = user_id);
        create policy "%1$s_update" on public.%1$I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
        create policy "%1$s_delete" on public.%1$I for delete to authenticated using (auth.uid() = user_id);
      $p$, t);
    end if;
  end loop;
end $$;

-- ============================================================
-- Auto-create user_profile on signup
-- ============================================================
create or replace function public.tg_handle_new_user()
returns trigger
security definer
set search_path = public
language plpgsql as $$
begin
  insert into public.user_profile (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();

-- ============================================================
-- Seed: sports + markets
-- ============================================================
insert into public.sports (slug, name) values
  ('futebol', 'Futebol'),
  ('basquete', 'Basquete'),
  ('tenis', 'Tênis'),
  ('mma', 'MMA'),
  ('volei', 'Vôlei'),
  ('esports', 'eSports'),
  ('outros', 'Outros')
on conflict (slug) do nothing;

insert into public.markets (slug, name, description) values
  ('1x2', 'Resultado final (1x2)', 'Vitória do mandante, empate ou vitória do visitante'),
  ('handicap-asiatico', 'Handicap asiático', 'Handicap com possibilidade de devolução parcial'),
  ('handicap-europeu', 'Handicap europeu', 'Handicap inteiro tradicional'),
  ('over-under', 'Over/Under (gols/pontos totais)', null),
  ('btts', 'Ambas marcam', null),
  ('escanteios', 'Escanteios', null),
  ('cartoes', 'Cartões', null),
  ('vencedor-evento', 'Vencedor do evento', null),
  ('outright', 'Outright (campeão da competição)', null),
  ('especial', 'Mercado especial / prop', null)
on conflict (slug) do nothing;
