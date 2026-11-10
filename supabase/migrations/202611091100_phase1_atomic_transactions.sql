-- Phase 1: atomic checkout, stock, payment, settlement, and fallback.
-- Safe to re-run on the Phase 0/M7 schema.

alter table public.events add column if not exists event_key text;
create unique index if not exists events_event_key_uidx on public.events(event_key) where event_key is not null;

alter table public.stock_reservations
  add column if not exists forecast_id uuid references public.harvest_forecasts(id),
  add column if not exists allocation_id uuid references public.allocations(id),
  add column if not exists release_reason text;

alter table public.payment_transactions
  add column if not exists checkout_key text,
  add column if not exists creation_state text not null default 'READY',
  add column if not exists claim_token text,
  add column if not exists claim_expires_at timestamptz;

update public.payment_transactions
set checkout_key = coalesce(checkout_key, idempotency_key, midtrans_order_id),
    creation_state = coalesce(creation_state, 'READY')
where checkout_key is null or creation_state is null;

alter table public.payment_transactions
  drop constraint if exists payment_transactions_creation_state_check;
alter table public.payment_transactions
  add constraint payment_transactions_creation_state_check
  check (creation_state in ('PENDING_CREATE', 'CLAIMED', 'READY', 'UNKNOWN'));

create unique index if not exists payment_transactions_one_per_order_uidx
  on public.payment_transactions(order_id);
create unique index if not exists payment_transactions_checkout_key_uidx
  on public.payment_transactions(checkout_key) where checkout_key is not null;
create index if not exists payment_transactions_claim_idx
  on public.payment_transactions(creation_state, claim_expires_at);
create index if not exists stock_reservations_forecast_active_idx
  on public.stock_reservations(forecast_id) where released_at is null;

alter table public.payment_webhook_events
  add column if not exists event_key text,
  add column if not exists processed_at timestamptz,
  add column if not exists processing_error text;

update public.payment_webhook_events
set event_key = coalesce(event_key, 'legacy:' || id::text)
where event_key is null;
alter table public.payment_webhook_events alter column event_key set not null;
create unique index if not exists payment_webhook_events_event_key_uidx on public.payment_webhook_events(event_key);
create index if not exists payment_webhook_events_unprocessed_idx
  on public.payment_webhook_events(processed_at) where processed_at is null;

alter table public.harvest_forecasts
  drop constraint if exists harvest_forecasts_reserved_kg_check;
alter table public.harvest_forecasts
  add constraint harvest_forecasts_reserved_kg_check check (reserved_kg >= 0 and reserved_kg <= est_kg);

-- Atomic cart/order graph creation. Candidate allocations are revalidated while
-- forecast rows are locked; browser/catalog totals never enter this function.
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
