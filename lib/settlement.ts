import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export class SettlementError extends Error {}

/** PostgreSQL owns locks, ledger writes, state transitions, and idempotency. */
export async function settlePaidOrder(admin: AdminClient, orderId: string) {
  const { data, error } = await admin.rpc("settle_paid_order", { p_order_id: orderId });
  if (error) throw new SettlementError(error.message || "Pencatatan settlement gagal.");
  return data;
}

export async function releasePaidOrder(admin: AdminClient, orderId: string, eventKey = `release:${orderId}`) {
  const { data, error } = await admin.rpc("release_paid_order", { p_order_id: orderId, p_event_key: eventKey });
  if (error) throw new SettlementError(error.message || "Pencairan gagal.");
  return data;
}
