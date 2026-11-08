-- M7 commerce extension: server-owned cart, orders, stock reservations, Midtrans audit.
-- Historical migration for deployed databases. Fresh installs use the final-shape
-- commerce block in supabase/schema.sql. All catalog prices remain simulated until
-- merchant production approval.

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'checked_out', 'abandoned')),
  created_at timestamptz not null default now()
);

create unique index if not exists carts_one_active_per_buyer_idx
  on public.carts (buyer_id) where status = 'active';

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id text not null,
  commodity_id uuid references public.commodities(id),
  qty_kg numeric not null check (qty_kg > 0),
  created_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  cart_id uuid references public.carts(id),
  idempotency_key text not null unique,
  status text not null default 'PENDING_PAYMENT'
    check (status in ('PENDING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED')),
  total_amount numeric not null check (total_amount >= 0),
  currency text not null default 'IDR' check (currency = 'IDR'),
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  product_name text not null,
  supplier_label text not null,
  grade grade_t not null,
  unit_price numeric not null check (unit_price >= 0),
  qty_kg numeric not null check (qty_kg > 0),
  subtotal numeric not null check (subtotal >= 0)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  midtrans_order_id text not null unique,
  snap_token text,
  status text not null default 'pending',
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_webhook_events (
  id bigserial primary key,
  midtrans_order_id text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now()
);

create table if not exists public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text not null,
  qty_kg numeric not null check (qty_kg > 0),
  expires_at timestamptz not null,
  released_at timestamptz
);

create index if not exists cart_items_cart_idx on public.cart_items(cart_id);
create index if not exists orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists payment_transactions_order_idx on public.payment_transactions(order_id);
create index if not exists webhook_events_order_idx on public.payment_webhook_events(midtrans_order_id);
create index if not exists stock_reservations_order_idx on public.stock_reservations(order_id);
create index if not exists stock_reservations_expiry_idx on public.stock_reservations(expires_at)
  where released_at is null;

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.stock_reservations enable row level security;

drop policy if exists "buyers own carts" on public.carts;
create policy "buyers own carts" on public.carts for select
  using (buyer_id = auth.uid() or public.current_user_role() = 'coordinator');
drop policy if exists "buyers own cart items" on public.cart_items;
create policy "buyers own cart items" on public.cart_items for select
  using (exists (select 1 from public.carts c where c.id = cart_id and
    (c.buyer_id = auth.uid() or public.current_user_role() = 'coordinator')));
drop policy if exists "buyers own orders" on public.orders;
create policy "buyers own orders" on public.orders for select
  using (buyer_id = auth.uid() or public.current_user_role() = 'coordinator');
drop policy if exists "buyers own order items" on public.order_items;
create policy "buyers own order items" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or public.current_user_role() = 'coordinator')));
drop policy if exists "buyers own payment transactions" on public.payment_transactions;
create policy "buyers own payment transactions" on public.payment_transactions for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or public.current_user_role() = 'coordinator')));
drop policy if exists "buyers own stock reservations" on public.stock_reservations;
create policy "buyers own stock reservations" on public.stock_reservations for select
  using (exists (select 1 from public.orders o where o.id = order_id and
    (o.buyer_id = auth.uid() or public.current_user_role() = 'coordinator')));

-- No authenticated insert/update/delete policies: all mutations go through server-side
-- service-role code after auth, validation, price snapshot, and idempotency checks.
-- Webhook rows are service-role write-only and are never exposed to buyers.
