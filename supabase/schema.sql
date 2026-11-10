-- AgriLink Bali M0 schema.
-- All application data is simulated; see seed.sql.

create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('farmer', 'buyer', 'coordinator');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type grade_t as enum ('A', 'B', 'C');
exception when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  display_name text not null,
  org_name text,
  regency text not null,
  wa_number text,
  is_simulated boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists commodities (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  shelf_life_days int
);

create table if not exists harvest_forecasts (
  id uuid primary key default gen_random_uuid(),
  farmer_id uuid not null references profiles(id),
  commodity_id uuid not null references commodities(id),
  est_kg numeric not null check (est_kg > 0),
  reserved_kg numeric not null default 0 check (reserved_kg >= 0),
  expected_harvest_date date not null,
  grade grade_t not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  check (reserved_kg <= est_kg)
);

create table if not exists buyer_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id),
  commodity_id uuid not null references commodities(id),
  qty_kg numeric not null check (qty_kg > 0),
  delivery_date date not null,
  min_grade grade_t not null default 'B',
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly')),
  status text not null default 'DRAFT',
  shortfall_kg numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists allocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references buyer_requests(id) on delete cascade,
  forecast_id uuid not null references harvest_forecasts(id),
  farmer_id uuid not null references profiles(id),
  role text not null check (role in ('primary', 'backup')),
  committed_kg numeric not null check (committed_kg > 0),
  status text not null default 'PROPOSED',
  confirm_deadline timestamptz,
  confirmed_at timestamptz,
  delivered_kg numeric,
  on_time boolean,
  grade_ok boolean,
  created_at timestamptz not null default now()
);

create table if not exists supplier_scores (
  farmer_id uuid primary key references profiles(id) on delete cascade,
  score numeric not null default 0.5 check (score between 0 and 1),
  n_deliveries int not null default 0
);

create table if not exists zone_distance (
  from_regency text not null,
  to_regency text not null,
  km numeric not null check (km >= 0),
  primary key (from_regency, to_regency)
);

create table if not exists events (
  id bigserial primary key,
  request_id uuid references buyer_requests(id),
  type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

create table if not exists baselines (
  metric text primary key,
  value numeric,
  source text,
  updated_at timestamptz not null default now()
);

create index if not exists harvest_forecasts_farmer_idx on harvest_forecasts(farmer_id);
create index if not exists harvest_forecasts_commodity_idx on harvest_forecasts(commodity_id);
create index if not exists buyer_requests_buyer_idx on buyer_requests(buyer_id);
create index if not exists allocations_request_idx on allocations(request_id);
create index if not exists allocations_farmer_idx on allocations(farmer_id);
create index if not exists events_request_idx on events(request_id);

-- Buyer-facing aggregate. It intentionally returns no farmer_id or forecast_id.
create or replace function public.get_availability_summary()
returns table (
  commodity_id uuid,
  commodity_name text,
  week_start date,
  available_kg numeric,
  forecast_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.commodity_id as commodity_id,
    c.name as commodity_name,
    date_trunc('week', f.expected_harvest_date)::date as week_start,
    sum(f.est_kg - f.reserved_kg) as available_kg,
    count(*) as forecast_count
  from harvest_forecasts f
  join commodities c on c.id = f.commodity_id
  where f.status = 'open'
    and f.expected_harvest_date >= current_date
    and f.expected_harvest_date < current_date + interval '28 days'
    and (auth.uid() is not null)
  group by f.commodity_id, c.name, date_trunc('week', f.expected_harvest_date)::date
  order by week_start, commodity_name;
$$;

grant execute on function public.get_availability_summary() to authenticated;

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

alter table profiles enable row level security;
alter table commodities enable row level security;
alter table harvest_forecasts enable row level security;
alter table buyer_requests enable row level security;
alter table allocations enable row level security;
alter table supplier_scores enable row level security;
alter table zone_distance enable row level security;
alter table events enable row level security;
alter table settings enable row level security;
alter table baselines enable row level security;

-- Profiles: users see their own profile; coordinators see all; buyers/farmers only receive
-- the limited profile fields needed by future server-side role-scoped queries.
drop policy if exists "profiles own or coordinator read" on profiles;
create policy "profiles own or coordinator read" on profiles for select
  using (id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "users update own profile" on profiles;
-- Profile mutations are service-role only: clients must not change role,
-- simulation flags, identity fields, or contact data through RLS.

drop policy if exists "authenticated read commodities" on commodities;
create policy "authenticated read commodities" on commodities for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage commodities" on commodities;
create policy "coordinator manage commodities" on commodities for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "farmers manage own forecasts" on harvest_forecasts;
drop policy if exists "farmers read own forecasts" on harvest_forecasts;
create policy "farmers read own forecasts" on harvest_forecasts for select
  using (farmer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "farmers create own forecasts" on harvest_forecasts;
create policy "farmers create own forecasts" on harvest_forecasts for insert
  with check (farmer_id = auth.uid() and current_user_role() = 'farmer');
drop policy if exists "coordinator manage forecasts" on harvest_forecasts;
create policy "coordinator manage forecasts" on harvest_forecasts for update
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "buyers read own requests" on buyer_requests;
create policy "buyers read own requests" on buyer_requests for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers create own requests" on buyer_requests;
create policy "buyers create own requests" on buyer_requests for insert
  with check (buyer_id = auth.uid() and current_user_role() = 'buyer');
drop policy if exists "buyers update own requests" on buyer_requests;
drop policy if exists "coordinators update requests" on buyer_requests;
create policy "coordinators update requests" on buyer_requests for update
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "allocation scoped read" on allocations;
create policy "allocation scoped read" on allocations for select
  using (
    farmer_id = auth.uid()
    or current_user_role() = 'coordinator'
    or exists (select 1 from buyer_requests r where r.id = request_id and r.buyer_id = auth.uid())
  );
drop policy if exists "farmers respond own allocations" on allocations;
drop policy if exists "coordinator updates allocations" on allocations;
create policy "coordinator updates allocations" on allocations for update
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');
drop policy if exists "coordinator creates allocations" on allocations;
create policy "coordinator creates allocations" on allocations for insert
  with check (current_user_role() = 'coordinator');

drop policy if exists "authenticated read supplier scores" on supplier_scores;
create policy "authenticated read supplier scores" on supplier_scores for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage supplier scores" on supplier_scores;
create policy "coordinator manage supplier scores" on supplier_scores for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "authenticated read zone distance" on zone_distance;
create policy "authenticated read zone distance" on zone_distance for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage zone distance" on zone_distance;
create policy "coordinator manage zone distance" on zone_distance for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "events scoped read" on events;
create policy "events scoped read" on events for select
  using (
    current_user_role() = 'coordinator'
    or exists (
      select 1 from buyer_requests r
      where r.id = request_id
        and (r.buyer_id = auth.uid()
          or exists (select 1 from allocations a where a.request_id = r.id and a.farmer_id = auth.uid()))
    )
  );
drop policy if exists "system inserts events" on events;
-- Event rows are append-only through server-side service-role helpers.
-- "Coordinator may not delete the event log" (spec section 3): no delete policy is defined,
-- which denies all deletes under RLS regardless of role.

drop policy if exists "authenticated read settings" on settings;
create policy "authenticated read settings" on settings for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage settings" on settings;
create policy "coordinator manage settings" on settings for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "authenticated read baselines" on baselines;
create policy "authenticated read baselines" on baselines for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage baselines" on baselines;
create policy "coordinator manage baselines" on baselines for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

-- Kawan Panen marketplace extension (final shape; supersedes the historical
-- 20261108_m7_commerce.sql + 20261109_kawan_panen_marketplace.sql migrations,
-- which remain idempotent no-ops on top of this for already-deployed databases).
create table if not exists hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  regency text not null,
  is_active boolean not null default true
);

alter table harvest_forecasts
  add column if not exists production_cost_per_kg numeric check (production_cost_per_kg >= 0),
  add column if not exists price_per_kg numeric check (price_per_kg >= 0),
  add column if not exists hub_id uuid references hubs(id),
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected'));

alter table allocations
  add column if not exists actual_kg numeric check (actual_kg >= 0),
  add column if not exists qc_photo_url text,
  add column if not exists qc_checked_by uuid references profiles(id),
  add column if not exists qc_checked_at timestamptz;

create table if not exists carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'checked_out', 'abandoned')),
  created_at timestamptz not null default now()
);

create unique index if not exists carts_one_active_per_buyer_idx
  on carts (buyer_id) where status = 'active';

create table if not exists cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  product_id text not null,
  commodity_id uuid references commodities(id),
  qty_kg numeric not null check (qty_kg > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  cart_id uuid references carts(id),
  request_id uuid references buyer_requests(id),
  hub_id uuid references hubs(id),
  idempotency_key text not null unique,
  status text not null default 'DRAFT' check (status in
    ('DRAFT', 'AWAITING_FARMER', 'CONFIRMED', 'PAID', 'AT_HUB', 'QC_DONE', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'CANCELLED')),
  total_amount numeric not null check (total_amount >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  allocation_id uuid references allocations(id),
  farmer_id uuid references profiles(id),
  product_id text not null,
  product_name text not null,
  supplier_label text not null,
  grade grade_t not null,
  unit_price numeric not null check (unit_price >= 0),
  qty_kg numeric not null check (qty_kg > 0),
  subtotal numeric not null check (subtotal >= 0),
  buyer_commission numeric not null default 0 check (buyer_commission >= 0),
  farmer_commission numeric not null default 0 check (farmer_commission >= 0),
  logistics_fee numeric not null default 0 check (logistics_fee >= 0)
);

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  midtrans_order_id text not null unique,
  snap_token text,
  status text not null default 'UNPAID' check (status in
    ('UNPAID', 'PAID_HELD', 'RELEASED', 'PARTIALLY_REFUNDED', 'REFUNDED')),
  provider text not null default 'mock' check (provider in ('mock', 'midtrans')),
  idempotency_key text unique,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists payment_webhook_events (
  id bigserial primary key,
  midtrans_order_id text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now()
);

create table if not exists stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null,
  qty_kg numeric not null check (qty_kg > 0),
  expires_at timestamptz not null,
  released_at timestamptz
);

create index if not exists cart_items_cart_idx on cart_items(cart_id);
create index if not exists orders_buyer_idx on orders(buyer_id, created_at desc);
create index if not exists order_items_order_idx on order_items(order_id);
create index if not exists order_items_farmer_idx on order_items(farmer_id);
create index if not exists payment_transactions_order_idx on payment_transactions(order_id);
create index if not exists webhook_events_order_idx on payment_webhook_events(midtrans_order_id);
create index if not exists stock_reservations_order_idx on stock_reservations(order_id);
create index if not exists stock_reservations_expiry_idx on stock_reservations(expires_at)
  where released_at is null;

-- Phase 1 atomic transaction support. The deployable migration is the source
-- for existing databases; this keeps fresh schema installs equivalent.
alter table events add column if not exists event_key text;
create unique index if not exists events_event_key_uidx on events(event_key) where event_key is not null;
alter table stock_reservations
  add column if not exists forecast_id uuid references harvest_forecasts(id),
  add column if not exists allocation_id uuid references allocations(id),
  add column if not exists release_reason text;
alter table payment_transactions
  add column if not exists checkout_key text,
  add column if not exists creation_state text not null default 'READY',
  add column if not exists claim_token text,
  add column if not exists claim_expires_at timestamptz;
alter table payment_webhook_events
  add column if not exists event_key text,
  add column if not exists processed_at timestamptz,
  add column if not exists processing_error text;
create unique index if not exists payment_transactions_one_per_order_uidx on payment_transactions(order_id);
create unique index if not exists payment_transactions_checkout_key_uidx on payment_transactions(checkout_key) where checkout_key is not null;
create index if not exists payment_transactions_claim_idx on payment_transactions(creation_state, claim_expires_at);
create index if not exists stock_reservations_forecast_active_idx on stock_reservations(forecast_id) where released_at is null;
create unique index if not exists payment_webhook_events_event_key_uidx on payment_webhook_events(event_key);
create index if not exists payment_webhook_events_unprocessed_idx on payment_webhook_events(processed_at) where processed_at is null;

-- Phase 1 RPC definitions. Keep this install source and
-- supabase/migrations/202611091100_phase1_atomic_transactions.sql synchronized.

create or replace function public.prepare_checkout(
  p_buyer_id uuid,
  p_cart_id uuid,
  p_checkout_key text,
  p_lines jsonb,
  p_expires_at timestamptz,
  p_provider text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_cart record;
  v_order_id uuid;
  v_request_id uuid;
  v_first_hub uuid;
  v_total numeric := 0;
  v_line jsonb;
  v_alloc jsonb;
  v_request uuid;
  v_forecast record;
  v_profile record;
  v_qty numeric;
  v_primary numeric;
  v_subtotal numeric;
  v_buyer_commission numeric;
  v_farmer_commission numeric;
  v_logistics numeric;
  v_settings jsonb;
  v_locked_count integer;
  v_expected_count integer;
  v_grade_rank integer;
  v_min_grade_rank integer;
  v_allocation_id uuid;
begin
  if p_provider not in ('mock', 'midtrans') then raise exception 'invalid payment provider'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'checkout lines are required';
  end if;

  select o.id, o.total_amount into v_existing
  from public.orders o where o.idempotency_key = p_checkout_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'total_amount', v_existing.total_amount, 'existing', true);
  end if;

  select * into v_cart from public.carts c
  where c.id = p_cart_id and c.buyer_id = p_buyer_id
  for update;
  if not found then raise exception 'cart not found or not owned by buyer'; end if;
  -- Re-check after the cart lock. A concurrent retry with the same checkout
  -- key must return the committed order, not fail because the cart is now
  -- checked_out.
  select o.id, o.total_amount into v_existing
  from public.orders o where o.idempotency_key = p_checkout_key;
  if found then
    return jsonb_build_object('order_id', v_existing.id, 'total_amount', v_existing.total_amount, 'existing', true);
  end if;
  if v_cart.status <> 'active' then raise exception 'cart is not active'; end if;

  -- Lock every source forecast in deterministic order before any stock change.
  select count(distinct (a->>'forecast_id')) into v_expected_count
  from jsonb_array_elements(p_lines) l
  cross join lateral jsonb_array_elements(coalesce(l->'allocations', '[]'::jsonb)) a;
  v_locked_count := 0;
  for v_forecast in
    select f.id from public.harvest_forecasts f
    where f.id in (
      select (a->>'forecast_id')::uuid
      from jsonb_array_elements(p_lines) l
      cross join lateral jsonb_array_elements(coalesce(l->'allocations', '[]'::jsonb)) a
    ) order by f.id for update
  loop
    v_locked_count := v_locked_count + 1;
  end loop;
  if v_locked_count <> v_expected_count then raise exception 'forecast source not found'; end if;

  select value into v_settings from public.settings where key = 'commerce';
  v_order_id := gen_random_uuid();
  insert into public.orders(id, buyer_id, cart_id, idempotency_key, status, total_amount)
  values (v_order_id, p_buyer_id, p_cart_id, p_checkout_key, 'DRAFT', 0);

  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_qty := (v_line->>'qty_kg')::numeric;
    if v_qty <= 0 or mod(v_qty, 1) <> 0 then raise exception 'invalid line quantity'; end if;
    insert into public.buyer_requests(buyer_id, commodity_id, qty_kg, delivery_date, min_grade, recurrence, status)
    values (p_buyer_id, (v_line->>'commodity_id')::uuid, v_qty, (v_line->>'delivery_date')::date,
            (v_line->>'min_grade')::grade_t, 'none', 'OPEN') returning id into v_request;
    if v_request_id is null then v_request_id := v_request; end if;

    select coalesce(sum((a->>'committed_kg')::numeric) filter (where a->>'role' = 'primary'), 0)
      into v_primary
    from jsonb_array_elements(coalesce(v_line->'allocations', '[]'::jsonb)) a;
    if v_primary <> v_qty then raise exception 'primary allocation does not cover requested quantity'; end if;

    for v_alloc in select value from jsonb_array_elements(coalesce(v_line->'allocations', '[]'::jsonb))
    loop
      v_qty := (v_alloc->>'committed_kg')::numeric;
      if v_qty <= 0 then raise exception 'invalid allocation quantity'; end if;
      select f.* into v_forecast from public.harvest_forecasts f where f.id = (v_alloc->>'forecast_id')::uuid;
      if not found or v_forecast.farmer_id <> (v_alloc->>'farmer_id')::uuid
        or v_forecast.commodity_id <> (v_line->>'commodity_id')::uuid
        or v_forecast.status <> 'open' or v_forecast.verification_status <> 'verified'
        or v_forecast.expected_harvest_date > (v_line->>'delivery_date')::date
        or (case when v_forecast.grade = 'A' then 3 when v_forecast.grade = 'B' then 2 else 1 end) <
           (case when (v_line->>'min_grade')::grade_t = 'A' then 3 when (v_line->>'min_grade')::grade_t = 'B' then 2 else 1 end)
      then raise exception 'allocation candidate failed revalidation'; end if;
      if v_alloc->>'role' not in ('primary', 'backup') then raise exception 'invalid allocation role'; end if;
      if v_alloc->>'role' = 'primary' and v_forecast.reserved_kg + v_qty > v_forecast.est_kg then
        raise exception 'stock is no longer available';
      end if;

      insert into public.allocations(request_id, forecast_id, farmer_id, role, committed_kg, status, confirm_deadline)
      values (v_request, v_forecast.id, v_forecast.farmer_id, v_alloc->>'role', v_qty,
              case when v_alloc->>'role' = 'primary' then 'PROPOSED' else 'STANDBY' end,
              (v_line->>'delivery_date')::date - interval '3 days')
      returning id into v_allocation_id;

      if v_alloc->>'role' = 'primary' then
        select p.* into v_profile from public.profiles p where p.id = v_forecast.farmer_id;
        v_subtotal := round(v_qty * v_forecast.price_per_kg);
        v_buyer_commission := round(v_subtotal * coalesce((v_settings->>'buyerCommissionBps')::numeric, 300) / 10000);
        v_farmer_commission := round(v_subtotal * coalesce((v_settings->>'farmerCommissionBps')::numeric, 300) / 10000);
        v_logistics := round(v_qty * coalesce((v_settings->>'logisticsPerKg')::numeric, 1500));
        insert into public.order_items(order_id, farmer_id, product_id, product_name, supplier_label, grade, unit_price, qty_kg, subtotal, buyer_commission, farmer_commission, logistics_fee)
        values (v_order_id, v_forecast.farmer_id, v_line->>'product_id', v_line->>'product_name',
          coalesce(v_profile.org_name, v_profile.display_name, 'Pemasok terverifikasi'), v_forecast.grade,
          v_forecast.price_per_kg, v_qty, v_subtotal, v_buyer_commission, v_farmer_commission, v_logistics);
        insert into public.stock_reservations(order_id, product_id, forecast_id, allocation_id, qty_kg, expires_at)
        values (v_order_id, v_line->>'product_id', v_forecast.id, v_allocation_id, v_qty, p_expires_at);
        update public.harvest_forecasts set reserved_kg = reserved_kg + v_qty where id = v_forecast.id;
        v_total := v_total + v_subtotal + v_buyer_commission + v_logistics;
        if v_first_hub is null then v_first_hub := v_forecast.hub_id; end if;
      end if;
    end loop;
  end loop;

  update public.orders set request_id = v_request_id, hub_id = v_first_hub, total_amount = v_total where id = v_order_id;
  insert into public.payment_transactions(order_id, midtrans_order_id, status, provider, idempotency_key, checkout_key, creation_state)
  values (v_order_id, v_order_id::text, 'UNPAID', p_provider, p_checkout_key, p_checkout_key, 'PENDING_CREATE');
  update public.carts set status = 'checked_out' where id = p_cart_id;
  insert into public.events(request_id, type, event_key, payload)
  values (v_request_id, 'checkout_prepared', 'checkout:' || v_order_id::text, jsonb_build_object('orderId', v_order_id, 'totalAmount', v_total));
  return jsonb_build_object('order_id', v_order_id, 'total_amount', v_total, 'existing', false);
exception when unique_violation then
  select o.id, o.total_amount into v_existing from public.orders o where o.idempotency_key = p_checkout_key;
  if found then return jsonb_build_object('order_id', v_existing.id, 'total_amount', v_existing.total_amount, 'existing', true); end if;
  raise;
end;
$$;

grant execute on function public.prepare_checkout(uuid, uuid, text, jsonb, timestamptz, text) to service_role;

create or replace function public.claim_payment_creation(p_order_id uuid, p_claim_token text, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  select * into p from public.payment_transactions where order_id = p_order_id for update;
  if not found then raise exception 'payment not found'; end if;
  if p.creation_state = 'READY' then
    return jsonb_build_object('claimed', false, 'state', 'READY', 'payment_id', p.id, 'reference', p.midtrans_order_id, 'snap_token', p.snap_token, 'provider', p.provider);
  end if;
  if p.creation_state = 'CLAIMED' and p.claim_expires_at is not null and p.claim_expires_at > p_now and p.claim_token <> p_claim_token then
    return jsonb_build_object('claimed', false, 'state', 'IN_PROGRESS', 'payment_id', p.id, 'provider', p.provider);
  end if;
  update public.payment_transactions set creation_state = 'CLAIMED', claim_token = p_claim_token, claim_expires_at = p_now + interval '5 minutes' where id = p.id;
  return jsonb_build_object('claimed', true, 'state', 'CLAIMED', 'payment_id', p.id, 'provider', p.provider, 'reference', p.midtrans_order_id);
end; $$;
grant execute on function public.claim_payment_creation(uuid, text, timestamptz) to service_role;

create or replace function public.finalize_payment_creation(p_payment_id uuid, p_claim_token text, p_provider text, p_reference text, p_snap_token text, p_raw_response jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p record;
begin
  update public.payment_transactions set provider = p_provider, midtrans_order_id = p_reference, snap_token = p_snap_token,
    raw_response = p_raw_response, creation_state = 'READY', claim_token = null, claim_expires_at = null
  where id = p_payment_id and creation_state = 'CLAIMED' and claim_token = p_claim_token
  returning * into p;
  if not found then
    select * into p from public.payment_transactions where id = p_payment_id;
    if found and p.creation_state = 'READY' then return jsonb_build_object('state','READY','reference',p.midtrans_order_id,'snap_token',p.snap_token,'provider',p.provider); end if;
    raise exception 'payment creation claim lost';
  end if;
  return jsonb_build_object('state','READY','reference',p.midtrans_order_id,'snap_token',p.snap_token,'provider',p.provider);
end; $$;
grant execute on function public.finalize_payment_creation(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.release_order_reservations(p_order_id uuid, p_reservation_id uuid default null, p_reason text default 'cancelled', p_event_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; key text := coalesce(p_event_key, 'reservation-release:' || p_order_id::text || ':' || coalesce(p_reservation_id::text, 'all'));
begin
  for r in select * from public.stock_reservations where order_id = p_order_id and released_at is null and (p_reservation_id is null or id = p_reservation_id) order by id for update
  loop
    update public.stock_reservations set released_at = now(), release_reason = p_reason where id = r.id and released_at is null;
    if found then
      update public.harvest_forecasts set reserved_kg = reserved_kg - r.qty_kg where id = r.forecast_id and reserved_kg >= r.qty_kg;
      if not found then raise exception 'reservation stock accounting mismatch'; end if;
      n := n + 1;
    end if;
  end loop;
  insert into public.events(request_id, type, event_key, payload)
  select o.request_id, 'stock_reservations_released', key, jsonb_build_object('orderId', p_order_id, 'releasedCount', n)
  from public.orders o where o.id = p_order_id
  on conflict (event_key) where event_key is not null do nothing;
  return jsonb_build_object('released_count', n, 'event_key', key);
end; $$;
grant execute on function public.release_order_reservations(uuid, uuid, text, text) to service_role;

create or replace function public.settle_paid_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; p record; i record; tx uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  select * into p from public.payment_transactions where order_id = p_order_id for update;
  if not found then raise exception 'payment not found'; end if;
  if p.status = 'PAID_HELD' and o.status = 'PAID' then return jsonb_build_object('already_settled', true); end if;
  if p.status <> 'UNPAID' or o.status not in ('DRAFT','AWAITING_FARMER','CONFIRMED') then raise exception 'invalid settlement transition'; end if;
  insert into public.ledger_transactions(source_type, source_id, idempotency_key) values ('order_settlement', p_order_id, 'settlement:' || p_order_id::text) returning id into tx;
  for i in select * from public.order_items where order_id = p_order_id loop
    insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'escrow', i.subtotal + i.buyer_commission + i.logistics_fee, 0, i.farmer_id::text);
    insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'farmer_payable', 0, i.subtotal - i.farmer_commission, i.farmer_id::text);
    insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'logistics_payable', 0, i.logistics_fee, i.farmer_id::text);
    insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'platform_revenue', 0, i.buyer_commission + i.farmer_commission, i.farmer_id::text);
  end loop;
  update public.payment_transactions set status = 'PAID_HELD' where id = p.id;
  update public.orders set status = 'PAID' where id = o.id;
  insert into public.events(request_id, type, event_key, payload) values (o.request_id, 'payment_settled', 'settlement:' || p_order_id::text, jsonb_build_object('orderId', p_order_id)) on conflict (event_key) where event_key is not null do nothing;
  return jsonb_build_object('already_settled', false);
end; $$;
grant execute on function public.settle_paid_order(uuid) to service_role;

create or replace function public.release_paid_order(p_order_id uuid, p_event_key text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; p record; i record; tx uuid; key text := coalesce(p_event_key, 'release:' || p_order_id::text);
begin
  select * into o from public.orders where id = p_order_id for update;
  select * into p from public.payment_transactions where order_id = p_order_id for update;
  if not found then raise exception 'payment not found'; end if;
  if p.status = 'RELEASED' and o.status = 'COMPLETED' then return jsonb_build_object('already_released', true); end if;
  if o.status <> 'DELIVERED' or p.status <> 'PAID_HELD' then raise exception 'invalid release transition'; end if;
  insert into public.ledger_transactions(source_type, source_id, idempotency_key) values ('release', p_order_id, key) on conflict (idempotency_key) do nothing returning id into tx;
  if tx is not null then
    for i in select * from public.order_items where order_id = p_order_id loop
      insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'escrow', 0, i.subtotal + i.buyer_commission + i.logistics_fee, i.farmer_id::text);
      insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'farmer_payable', i.subtotal - i.farmer_commission, 0, i.farmer_id::text);
      insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'logistics_payable', i.logistics_fee, 0, i.farmer_id::text);
      insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'platform_revenue', i.buyer_commission + i.farmer_commission, 0, i.farmer_id::text);
    end loop;
  end if;
  update public.payment_transactions set status = 'RELEASED' where id = p.id;
  update public.orders set status = 'COMPLETED' where id = o.id;
  insert into public.events(request_id, type, event_key, payload) values (o.request_id, 'payment_released', key, jsonb_build_object('orderId', p_order_id)) on conflict (event_key) where event_key is not null do nothing;
  return jsonb_build_object('already_released', false);
end; $$;
grant execute on function public.release_paid_order(uuid, text) to service_role;

create or replace function public.process_payment_webhook(p_event_key text, p_midtrans_order_id text, p_payload jsonb, p_transaction_status text, p_gross_amount numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e bigint; p record; o record; i record; tx uuid; paid boolean;
begin
  insert into public.payment_webhook_events(event_key, midtrans_order_id, payload, signature_valid) values (p_event_key, p_midtrans_order_id, p_payload, true) on conflict (event_key) do nothing returning id into e;
  if e is null then return jsonb_build_object('duplicate', true); end if;
  select * into p from public.payment_transactions where midtrans_order_id = p_midtrans_order_id for update;
  if not found then update public.payment_webhook_events set processed_at = now(), processing_error = 'payment not found' where id = e; raise exception 'payment not found'; end if;
  select * into o from public.orders where id = p.order_id for update;
  if p_gross_amount <> o.total_amount then raise exception 'gross amount mismatch'; end if;
  paid := p_transaction_status = 'settlement'
    or (p_transaction_status = 'capture' and p_payload->>'fraud_status' = 'accept');
  if paid then
    if p.status = 'PAID_HELD' and o.status = 'PAID' then update public.payment_webhook_events set processed_at = now() where id = e; return jsonb_build_object('duplicate', true, 'paid', true); end if;
    if p.status <> 'UNPAID' then raise exception 'invalid payment webhook transition'; end if;
    insert into public.ledger_transactions(source_type, source_id, idempotency_key) values ('order_settlement', p.order_id, 'settlement:' || p.order_id::text) on conflict (idempotency_key) do nothing returning id into tx;
    if tx is not null then
      for i in select * from public.order_items where order_id = p.order_id loop
        insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'escrow', i.subtotal+i.buyer_commission+i.logistics_fee, 0, i.farmer_id::text);
        insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'farmer_payable', 0, i.subtotal-i.farmer_commission, i.farmer_id::text);
        insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'logistics_payable', 0, i.logistics_fee, i.farmer_id::text);
        insert into public.ledger_entries(transaction_id, account_code, debit, credit, reference) values (tx, 'platform_revenue', 0, i.buyer_commission+i.farmer_commission, i.farmer_id::text);
      end loop;
    end if;
    update public.payment_transactions set status = 'PAID_HELD' where id = p.id;
    update public.orders set status = 'PAID' where id = o.id;
  elsif p_transaction_status in ('expire','cancel','deny','failure') then
    -- Guard against a late/out-of-order non-paid webhook arriving after this
    -- payment already settled: never release stock or cancel an order that
    -- is no longer UNPAID (paid, released, or already refunded/cancelled).
    if p.status = 'UNPAID' then
      perform public.release_order_reservations(p.order_id, null, p_transaction_status, 'webhook-release:' || p_event_key);
      -- UNPAID provider failure is not a refund; no provider refund occurred.
      insert into public.events(request_id, type, event_key, payload)
      values (o.request_id, 'payment_cancelled', 'payment-cancelled:' || p_event_key,
              jsonb_build_object('orderId', p.order_id, 'transactionStatus', p_transaction_status))
      on conflict (event_key) where event_key is not null do nothing;
      update public.orders set status = 'CANCELLED' where id = o.id and status not in ('PAID','AT_HUB','QC_DONE','IN_TRANSIT','DELIVERED','COMPLETED');
    end if;
  end if;
  update public.payment_webhook_events set processed_at = now() where id = e;
  return jsonb_build_object('duplicate', false, 'paid', paid);
exception when others then
  update public.payment_webhook_events set processing_error = sqlerrm where id = e;
  raise;
end; $$;
grant execute on function public.process_payment_webhook(text, text, jsonb, text, numeric) to service_role;

create or replace function public.claim_expired_allocation(p_allocation_id uuid, p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  update public.allocations set status = 'EXPIRED' where id = p_allocation_id and status = 'PROPOSED' and confirm_deadline < p_now returning id, request_id, forecast_id, committed_kg into a;
  if not found then return jsonb_build_object('claimed', false); end if;
  return jsonb_build_object('claimed', true, 'allocation_id', a.id, 'request_id', a.request_id, 'forecast_id', a.forecast_id, 'committed_kg', a.committed_kg);
end; $$;
grant execute on function public.claim_expired_allocation(uuid, timestamptz) to service_role;

-- p_shortfall_kg is the kg to release/re-promote: the full committed_kg for a
-- declined/expired primary (caller passes committed_kg), or just the QC gap
-- for a partial delivery (caller passes committed_kg - actual_kg; the
-- allocation itself is left DELIVERED, since that correctly records what was
-- actually received — this function never overwrites a DECLINED/DELIVERED
-- allocation back to FAILED, only a still-pending PROPOSED/EXPIRED one).
create or replace function public.process_allocation_fallback(
  p_allocation_id uuid,
  p_event_key text,
  p_shortfall_kg numeric default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a record; b record; remaining numeric; v_promote numeric; promoted integer := 0; deadline timestamptz := now() + interval '2 days'; e bigint;
begin
  -- Lock the allocation before inserting the trigger event. This makes a
  -- second caller with a different event key wait, then observe the recorded
  -- fallback and return a no-op instead of releasing stock twice.
  select * into a from public.allocations where id = p_allocation_id for update;
  if not found or a.role <> 'primary' or a.status not in ('PROPOSED','FAILED','EXPIRED','DECLINED','DELIVERED') then
    return jsonb_build_object('duplicate', true, 'promoted_count', 0, 'remaining_kg', 0);
  end if;
  if exists (
    select 1 from public.events
    where type = 'fallback_triggered'
      and payload->>'allocationId' = p_allocation_id::text
  ) then
    return jsonb_build_object('duplicate', true, 'promoted_count', 0, 'remaining_kg', 0);
  end if;
  insert into public.events(request_id, type, event_key, payload)
  values (a.request_id, 'fallback_triggered', p_event_key, jsonb_build_object('allocationId', p_allocation_id))
  on conflict (event_key) where event_key is not null do nothing returning id into e;
  if e is null then return jsonb_build_object('duplicate', true, 'promoted_count', 0, 'remaining_kg', 0); end if;
  if p_shortfall_kg is not null and p_shortfall_kg <= 0 then raise exception 'fallback shortfall must be positive'; end if;
  remaining := least(coalesce(p_shortfall_kg, a.committed_kg), a.committed_kg);
  if remaining <= 0 then return jsonb_build_object('duplicate', false, 'promoted_count', 0, 'remaining_kg', 0); end if;
  update public.allocations set status = 'FAILED' where id = a.id and status in ('PROPOSED','EXPIRED');
  update public.harvest_forecasts set reserved_kg = reserved_kg - remaining where id = a.forecast_id and reserved_kg >= remaining;
  if not found then raise exception 'fallback stock accounting mismatch'; end if;
  for b in select * from public.allocations where request_id = a.request_id and role = 'backup' and status = 'STANDBY' order by created_at, id for update
  loop
    exit when remaining <= 0;
    v_promote := least(b.committed_kg, remaining);
    update public.harvest_forecasts set reserved_kg = reserved_kg + v_promote
      where id = b.forecast_id and reserved_kg + v_promote <= est_kg;
    if found then
      -- The backup row may have been sized above this failure's gap. Freeze
      -- only the quantity actually promoted; otherwise allocation kg would
      -- exceed the stock reservation and a later fallback would over-release.
      update public.allocations
      set status = 'PROPOSED', committed_kg = v_promote, confirm_deadline = deadline
      where id = b.id and status = 'STANDBY';
      remaining := remaining - v_promote;
      promoted := promoted + 1;
    end if;
  end loop;
  update public.buyer_requests set status = case when promoted > 0 then 'FALLBACK_ACTIVE' else 'PARTIAL' end, shortfall_kg = greatest(0, remaining) where id = a.request_id;
  insert into public.events(request_id, type, event_key, payload) values (a.request_id, 'backup_promoted', p_event_key || ':backup', jsonb_build_object('promotedCount', promoted, 'remainingKg', greatest(0, remaining))) on conflict (event_key) where event_key is not null do nothing;
  return jsonb_build_object('duplicate', false, 'promoted_count', promoted, 'remaining_kg', greatest(0, remaining));
end; $$;
grant execute on function public.process_allocation_fallback(uuid, text, numeric) to service_role;

-- Atomic persistence for the non-commerce buyer-request matching path
-- (app/buyer/requests/actions.ts runMatching). Forecast rows are locked in
-- deterministic order and the reserved_kg increment is conditional, so a
-- concurrent allocation against the same forecast can never oversell it —
-- this replaces the old stale read-modify-write (`reserved_kg + allocation.kg`
-- computed in TypeScript from an earlier, now-stale read).
create or replace function public.commit_match_allocations(
  p_request_id uuid,
  p_allocations jsonb,
  p_status text,
  p_shortfall_kg numeric
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a jsonb; v_kg numeric; v_forecast_id uuid; v_existing_count integer; v_request_id uuid;
begin
  if p_status not in ('MATCHED', 'PARTIAL') then raise exception 'invalid match status'; end if;

  -- Serialize matching attempts for this request before checking existing
  -- allocations; otherwise two concurrent runners can both observe zero rows.
  select id into v_request_id from public.buyer_requests where id = p_request_id for update;
  if not found then raise exception 'request not found'; end if;

  -- Idempotency: a retried/duplicate runMatching() call for a request that
  -- already has allocations must not insert a second set and double-reserve
  -- stock. First match wins; later calls are a no-op.
  select count(*) into v_existing_count from public.allocations where request_id = p_request_id;
  if v_existing_count > 0 then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  perform 1 from public.harvest_forecasts
  where id in (select (x->>'forecast_id')::uuid from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) x)
  order by id for update;

  for a in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    v_forecast_id := (a->>'forecast_id')::uuid;
    v_kg := (a->>'committed_kg')::numeric;
    if v_kg <= 0 then raise exception 'invalid allocation quantity'; end if;
    insert into public.allocations(request_id, forecast_id, farmer_id, role, committed_kg, status, confirm_deadline)
    values (p_request_id, v_forecast_id, (a->>'farmer_id')::uuid, a->>'role', v_kg,
            case when a->>'role' = 'primary' then 'PROPOSED' else 'STANDBY' end,
            (a->>'confirm_deadline')::timestamptz);
    if a->>'role' = 'primary' then
      update public.harvest_forecasts set reserved_kg = reserved_kg + v_kg
        where id = v_forecast_id and reserved_kg + v_kg <= est_kg;
      if not found then raise exception 'stock is no longer available'; end if;
    end if;
  end loop;

  update public.buyer_requests set status = p_status, shortfall_kg = p_shortfall_kg where id = p_request_id;
  insert into public.events(request_id, type, payload)
  values (p_request_id, case when p_status = 'MATCHED' then 'matched' else 'partial' end,
          jsonb_build_object('allocations', jsonb_array_length(coalesce(p_allocations, '[]'::jsonb)), 'shortfallKg', p_shortfall_kg));
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.commit_match_allocations(uuid, jsonb, text, numeric) to service_role;

-- Mutation RPCs are server-owned. PostgreSQL grants EXECUTE to PUBLIC by
-- default, so revoke it explicitly before granting only to service_role.
revoke execute on function public.prepare_checkout(uuid, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.claim_payment_creation(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.finalize_payment_creation(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.release_order_reservations(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.settle_paid_order(uuid) from public, anon, authenticated;
revoke execute on function public.release_paid_order(uuid, text) from public, anon, authenticated;
revoke execute on function public.process_payment_webhook(text, text, jsonb, text, numeric) from public, anon, authenticated;
revoke execute on function public.claim_expired_allocation(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.process_allocation_fallback(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.commit_match_allocations(uuid, jsonb, text, numeric) from public, anon, authenticated;

alter table carts enable row level security;
alter table cart_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payment_transactions enable row level security;
alter table payment_webhook_events enable row level security;
alter table stock_reservations enable row level security;

drop policy if exists "buyers own carts" on carts;
create policy "buyers own carts" on carts for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers own cart items" on cart_items;
create policy "buyers own cart items" on cart_items for select
  using (exists (select 1 from carts c where c.id = cart_id and
    (c.buyer_id = auth.uid() or current_user_role() = 'coordinator')));
drop policy if exists "buyers own orders" on orders;
create policy "buyers own orders" on orders for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers own order items" on order_items;
create policy "buyers own order items" on order_items for select
  using (exists (select 1 from orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or current_user_role() = 'coordinator'))
    or farmer_id = auth.uid());
drop policy if exists "buyers own payment transactions" on payment_transactions;
create policy "buyers own payment transactions" on payment_transactions for select
  using (exists (select 1 from orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or current_user_role() = 'coordinator')));
drop policy if exists "buyers own stock reservations" on stock_reservations;
create policy "buyers own stock reservations" on stock_reservations for select
  using (exists (select 1 from orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or current_user_role() = 'coordinator')));

-- No authenticated insert/update/delete policies on carts/orders/payments: all
-- mutations go through server-side service-role code (lib/commerce.ts, webhook
-- route) after auth, validation, price snapshot, and idempotency checks.

create table if not exists deliveries (
  order_id uuid primary key references orders(id) on delete cascade,
  hub_id uuid references hubs(id),
  courier_label text not null default 'Mitra Logistik Simulasi',
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_photo_url text
);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  current_period_end date not null,
  payment_transaction_id uuid references payment_transactions(id),
  created_at timestamptz not null default now()
);

create table if not exists local_absorption_inputs (
  buyer_id uuid not null references profiles(id) on delete cascade,
  period_month date not null,
  total_all_horticulture_spend numeric not null check (total_all_horticulture_spend >= 0),
  updated_at timestamptz not null default now(),
  primary key (buyer_id, period_month)
);

create table if not exists ledger_accounts (code text primary key);
insert into ledger_accounts (code) values
  ('escrow'), ('farmer_payable'), ('logistics_payable'), ('platform_revenue'), ('buyer_refund')
on conflict do nothing;

create table if not exists ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('order_settlement', 'refund', 'release')),
  source_id uuid not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id bigserial primary key,
  transaction_id uuid not null references ledger_transactions(id) on delete cascade,
  account_code text not null references ledger_accounts(code),
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  reference text,
  created_at timestamptz not null default now()
);

alter table hubs enable row level security;
alter table deliveries enable row level security;
alter table subscriptions enable row level security;

drop policy if exists "deliveries scoped read" on deliveries;
create policy "deliveries scoped read" on deliveries for select
  using (
    current_user_role() = 'coordinator'
    or exists (select 1 from orders o where o.id = order_id and o.buyer_id = auth.uid())
    or exists (
      select 1 from order_items oi
      where oi.order_id = deliveries.order_id and oi.farmer_id = auth.uid()
    )
  );
drop policy if exists "coordinator manage deliveries" on deliveries;
create policy "coordinator manage deliveries" on deliveries for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');
alter table local_absorption_inputs enable row level security;
alter table ledger_accounts enable row level security;
alter table ledger_transactions enable row level security;
alter table ledger_entries enable row level security;

drop policy if exists "authenticated read hubs" on hubs;
create policy "authenticated read hubs" on hubs for select using (auth.uid() is not null);
drop policy if exists "coordinator manage hubs" on hubs;
create policy "coordinator manage hubs" on hubs for all
  using (current_user_role() = 'coordinator') with check (current_user_role() = 'coordinator');
drop policy if exists "buyers own subscriptions" on subscriptions;
create policy "buyers own subscriptions" on subscriptions for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers own local absorption inputs" on local_absorption_inputs;
create policy "buyers own local absorption inputs" on local_absorption_inputs for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers write own local absorption inputs" on local_absorption_inputs;
create policy "buyers write own local absorption inputs" on local_absorption_inputs for insert
  with check (buyer_id = auth.uid());
drop policy if exists "buyers update own local absorption inputs" on local_absorption_inputs;
create policy "buyers update own local absorption inputs" on local_absorption_inputs for update
  using (buyer_id = auth.uid()) with check (buyer_id = auth.uid());
drop policy if exists "coordinator reads ledger accounts" on ledger_accounts;
create policy "coordinator reads ledger accounts" on ledger_accounts for select
  using (current_user_role() = 'coordinator');
drop policy if exists "coordinator reads ledger transactions" on ledger_transactions;
create policy "coordinator reads ledger transactions" on ledger_transactions for select
  using (current_user_role() = 'coordinator');
drop policy if exists "coordinator reads ledger entries" on ledger_entries;
create policy "coordinator reads ledger entries" on ledger_entries for select
  using (current_user_role() = 'coordinator');

insert into settings (key, value) values
  ('commerce', '{"farmerCommissionBps":300,"buyerCommissionBps":300,"logisticsPerKg":1500,"subscriptionMonthly":400000,"priceFloorMultiplier":1.2,"localAbsorptionThresholdPct":0.3,"disputeWindowHours":24}'::jsonb)
on conflict (key) do update set value = excluded.value;
