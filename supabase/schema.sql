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
create policy "users update own profile" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "authenticated read commodities" on commodities;
create policy "authenticated read commodities" on commodities for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage commodities" on commodities;
create policy "coordinator manage commodities" on commodities for all
  using (current_user_role() = 'coordinator')
  with check (current_user_role() = 'coordinator');

drop policy if exists "farmers manage own forecasts" on harvest_forecasts;
create policy "farmers manage own forecasts" on harvest_forecasts for all
  using (farmer_id = auth.uid() or current_user_role() = 'coordinator')
  with check (farmer_id = auth.uid() or current_user_role() = 'coordinator');

drop policy if exists "buyers read own requests" on buyer_requests;
create policy "buyers read own requests" on buyer_requests for select
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator');
drop policy if exists "buyers create own requests" on buyer_requests;
create policy "buyers create own requests" on buyer_requests for insert
  with check (buyer_id = auth.uid() and current_user_role() = 'buyer');
drop policy if exists "buyers update own requests" on buyer_requests;
create policy "buyers update own requests" on buyer_requests for update
  using (buyer_id = auth.uid() or current_user_role() = 'coordinator')
  with check (buyer_id = auth.uid() or current_user_role() = 'coordinator');

drop policy if exists "allocation scoped read" on allocations;
create policy "allocation scoped read" on allocations for select
  using (
    farmer_id = auth.uid()
    or current_user_role() = 'coordinator'
    or exists (select 1 from buyer_requests r where r.id = request_id and r.buyer_id = auth.uid())
  );
drop policy if exists "farmers respond own allocations" on allocations;
create policy "farmers respond own allocations" on allocations for update
  using (farmer_id = auth.uid() or current_user_role() = 'coordinator')
  with check (farmer_id = auth.uid() or current_user_role() = 'coordinator');
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
create policy "system inserts events" on events for insert
  with check (auth.uid() is not null);
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
