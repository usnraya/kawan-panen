-- Kawan Panen marketplace extension: hubs, commission/ledger settlement, QC,
-- deliveries, subscriptions, local absorption reporting. Apply after
-- supabase/migrations/20261108_m7_commerce.sql. Historical migration for
-- deployed databases; fresh installs use supabase/schema.sql, which already
-- includes this final shape. All data remains simulated; lib/matching.ts and
-- lib/scoring.ts are untouched by this migration.

create table if not exists public.hubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  regency text not null,
  is_active boolean not null default true
);

insert into public.hubs (name, regency, is_active) values
  ('Hub Tabanan', 'Tabanan', true),
  ('Titik Kumpul Karangasem', 'Karangasem', true)
on conflict do nothing;

-- harvest_forecasts: farmer-set cost/price and hub, plus coordinator verification.
alter table public.harvest_forecasts
  add column if not exists production_cost_per_kg numeric check (production_cost_per_kg >= 0),
  add column if not exists price_per_kg numeric check (price_per_kg >= 0),
  add column if not exists hub_id uuid references public.hubs(id),
  add column if not exists verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected'));

-- allocations: QC recorded at the hub (actual weight, grade pass/fail, photo, inspector).
alter table public.allocations
  add column if not exists actual_kg numeric check (actual_kg >= 0),
  add column if not exists qc_photo_url text,
  add column if not exists qc_checked_by uuid references public.profiles(id),
  add column if not exists qc_checked_at timestamptz;

-- orders: full Kawan Panen fulfillment lifecycle, linked back to the matching request/hub.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add column if not exists request_id uuid references public.buyer_requests(id),
  add column if not exists hub_id uuid references public.hubs(id);
alter table public.orders alter column status set default 'DRAFT';
update public.orders set status = 'DRAFT' where status = 'PENDING_PAYMENT';
update public.orders set status = 'PAID' where status not in
  ('DRAFT','AWAITING_FARMER','CONFIRMED','PAID','AT_HUB','QC_DONE','IN_TRANSIT','DELIVERED','COMPLETED','DISPUTED','CANCELLED');
alter table public.orders add constraint orders_status_check check (status in
  ('DRAFT','AWAITING_FARMER','CONFIRMED','PAID','AT_HUB','QC_DONE','IN_TRANSIT','DELIVERED','COMPLETED','DISPUTED','CANCELLED'));

-- order_items: per-farmer line with the commission/logistics breakdown frozen at checkout.
alter table public.order_items
  add column if not exists allocation_id uuid references public.allocations(id),
  add column if not exists farmer_id uuid references public.profiles(id),
  add column if not exists buyer_commission numeric not null default 0 check (buyer_commission >= 0),
  add column if not exists farmer_commission numeric not null default 0 check (farmer_commission >= 0),
  add column if not exists logistics_fee numeric not null default 0 check (logistics_fee >= 0);

-- payment_transactions: UNPAID -> PAID_HELD -> RELEASED | PARTIALLY_REFUNDED | REFUNDED (lib/state-machine.ts).
alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;
alter table public.payment_transactions alter column status set default 'UNPAID';
update public.payment_transactions set status = 'UNPAID' where status = 'pending';
update public.payment_transactions set status = 'PAID_HELD' where status not in
  ('UNPAID','PAID_HELD','RELEASED','PARTIALLY_REFUNDED','REFUNDED');
alter table public.payment_transactions add constraint payment_transactions_status_check check (status in
  ('UNPAID','PAID_HELD','RELEASED','PARTIALLY_REFUNDED','REFUNDED'));
alter table public.payment_transactions
  add column if not exists provider text not null default 'mock' check (provider in ('mock', 'midtrans')),
  add column if not exists idempotency_key text unique;

create table if not exists public.deliveries (
  order_id uuid primary key references public.orders(id) on delete cascade,
  hub_id uuid references public.hubs(id),
  courier_label text not null default 'Mitra Logistik Simulasi',
  status text not null default 'assigned' check (status in ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed')),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proof_photo_url text
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'cancelled', 'expired')),
  current_period_end date not null,
  payment_transaction_id uuid references public.payment_transactions(id),
  created_at timestamptz not null default now()
);

create table if not exists public.local_absorption_inputs (
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  period_month date not null,
  total_all_horticulture_spend numeric not null check (total_all_horticulture_spend >= 0),
  updated_at timestamptz not null default now(),
  primary key (buyer_id, period_month)
);

-- Double-entry ledger (lib/ledger.ts posts entries; this stores them). All writes are
-- service-role only, after a settle_paid_order()/refund RPC checks state-machine rules.
create table if not exists public.ledger_accounts (
  code text primary key
);
insert into public.ledger_accounts (code) values
  ('escrow'), ('farmer_payable'), ('logistics_payable'), ('platform_revenue'), ('buyer_refund')
on conflict do nothing;

create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('order_settlement', 'refund', 'release')),
  source_id uuid not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_entries (
  id bigserial primary key,
  transaction_id uuid not null references public.ledger_transactions(id) on delete cascade,
  account_code text not null references public.ledger_accounts(code),
  debit numeric not null default 0 check (debit >= 0),
  credit numeric not null default 0 check (credit >= 0),
  reference text,
  created_at timestamptz not null default now()
);

-- Widen source_type for databases that already ran this migration before 'release' existed.
alter table public.ledger_transactions drop constraint if exists ledger_transactions_source_type_check;
alter table public.ledger_transactions add constraint ledger_transactions_source_type_check
  check (source_type in ('order_settlement', 'refund', 'release'));

create index if not exists order_items_farmer_idx on public.order_items(farmer_id);
create index if not exists deliveries_hub_idx on public.deliveries(hub_id);
create index if not exists ledger_entries_transaction_idx on public.ledger_entries(transaction_id);
create index if not exists ledger_entries_account_idx on public.ledger_entries(account_code);

insert into public.settings (key, value) values
  ('commerce', '{"farmerCommissionBps":300,"buyerCommissionBps":300,"logisticsPerKg":1500,"subscriptionMonthly":400000,"priceFloorMultiplier":1.2,"localAbsorptionThresholdPct":0.3,"disputeWindowHours":24}'::jsonb)
on conflict (key) do update set value = excluded.value;

alter table public.hubs enable row level security;
alter table public.deliveries enable row level security;
alter table public.subscriptions enable row level security;
alter table public.local_absorption_inputs enable row level security;
alter table public.ledger_accounts enable row level security;
alter table public.ledger_transactions enable row level security;
alter table public.ledger_entries enable row level security;

drop policy if exists "authenticated read hubs" on public.hubs;
create policy "authenticated read hubs" on public.hubs for select
  using (auth.uid() is not null);
drop policy if exists "coordinator manage hubs" on public.hubs;
create policy "coordinator manage hubs" on public.hubs for all
  using (public.current_user_role() = 'coordinator')
  with check (public.current_user_role() = 'coordinator');

drop policy if exists "deliveries scoped read" on public.deliveries;
create policy "deliveries scoped read" on public.deliveries for select
  using (
    public.current_user_role() = 'coordinator'
    or exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
    or exists (
      select 1 from public.order_items oi where oi.order_id = deliveries.order_id and oi.farmer_id = auth.uid()
    )
  );
drop policy if exists "coordinator manage deliveries" on public.deliveries;
create policy "coordinator manage deliveries" on public.deliveries for all
  using (public.current_user_role() = 'coordinator')
  with check (public.current_user_role() = 'coordinator');

drop policy if exists "buyers own subscriptions" on public.subscriptions;
create policy "buyers own subscriptions" on public.subscriptions for select
  using (buyer_id = auth.uid() or public.current_user_role() = 'coordinator');

drop policy if exists "buyers own local absorption inputs" on public.local_absorption_inputs;
create policy "buyers own local absorption inputs" on public.local_absorption_inputs for select
  using (buyer_id = auth.uid() or public.current_user_role() = 'coordinator');
drop policy if exists "buyers write own local absorption inputs" on public.local_absorption_inputs;
create policy "buyers write own local absorption inputs" on public.local_absorption_inputs for insert
  with check (buyer_id = auth.uid());
drop policy if exists "buyers update own local absorption inputs" on public.local_absorption_inputs;
create policy "buyers update own local absorption inputs" on public.local_absorption_inputs for update
  using (buyer_id = auth.uid())
  with check (buyer_id = auth.uid());

-- Ledger tables are coordinator-readable only; all writes are service-role via RPC,
-- same pattern as payment_webhook_events in M7 (no authenticated insert/update policy).
drop policy if exists "coordinator reads ledger accounts" on public.ledger_accounts;
create policy "coordinator reads ledger accounts" on public.ledger_accounts for select
  using (public.current_user_role() = 'coordinator');
drop policy if exists "coordinator reads ledger transactions" on public.ledger_transactions;
create policy "coordinator reads ledger transactions" on public.ledger_transactions for select
  using (public.current_user_role() = 'coordinator');
drop policy if exists "coordinator reads ledger entries" on public.ledger_entries;
create policy "coordinator reads ledger entries" on public.ledger_entries for select
  using (public.current_user_role() = 'coordinator');
