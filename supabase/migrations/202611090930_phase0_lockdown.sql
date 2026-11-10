-- Phase 0 security lockdown.
-- Client workflow writes are removed; server actions use the service role only
-- after authenticating and authorizing the actor. Safe to re-run.

-- Profiles: no authenticated update policy. Registration already uses the
-- service role, preventing role/is_simulated/identity escalation.
drop policy if exists "users update own profile" on public.profiles;

-- Forecasts: farmers may create/read their own rows, but only coordinators or
-- server-role code may mutate verification, stock, price, hub, or status fields.
drop policy if exists "farmers manage own forecasts" on public.harvest_forecasts;
drop policy if exists "farmers read own forecasts" on public.harvest_forecasts;
create policy "farmers read own forecasts" on public.harvest_forecasts for select
  using (farmer_id = auth.uid() or public.current_user_role() = 'coordinator');
drop policy if exists "farmers create own forecasts" on public.harvest_forecasts;
create policy "farmers create own forecasts" on public.harvest_forecasts for insert
  with check (farmer_id = auth.uid() and public.current_user_role() = 'farmer');
drop policy if exists "coordinator manage forecasts" on public.harvest_forecasts;
create policy "coordinator manage forecasts" on public.harvest_forecasts for update
  using (public.current_user_role() = 'coordinator')
  with check (public.current_user_role() = 'coordinator');

-- Buyer request workflow fields are coordinator/service-role only.
drop policy if exists "buyers update own requests" on public.buyer_requests;
drop policy if exists "coordinators update requests" on public.buyer_requests;
create policy "coordinators update requests" on public.buyer_requests for update
  using (public.current_user_role() = 'coordinator')
  with check (public.current_user_role() = 'coordinator');

-- Farmers can read allocations, but response writes go through the server
-- action's authenticated-user check plus service-role conditional update.
drop policy if exists "farmers respond own allocations" on public.allocations;
drop policy if exists "coordinator updates allocations" on public.allocations;
create policy "coordinator updates allocations" on public.allocations for update
  using (public.current_user_role() = 'coordinator')
  with check (public.current_user_role() = 'coordinator');

-- Event log is append-only and server-owned; no authenticated insert/update/delete.
drop policy if exists "system inserts events" on public.events;
drop policy if exists "authenticated inserts events" on public.events;
