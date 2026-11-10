import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Compatibility helper for non-persistence callers. Stock mutation is RPC-owned. */
export function releaseKg(reservedKg: number, qtyKg: number) {
  return Math.max(0, reservedKg - qtyKg);
}

export async function releaseOrderStock(admin: AdminClient, orderId: string, reservationId?: string, reason = "cancelled") {
  const { data, error } = await admin.rpc("release_order_reservations", {
    p_order_id: orderId,
    p_reservation_id: reservationId ?? null,
    p_reason: reason,
    p_event_key: `reservation-release:${orderId}:${reservationId ?? "all"}`,
  });
  if (error) throw error;
  const count = Number(data?.released_count ?? 0);
  return count > 0 ? [reservationId ?? orderId] : [];
}

export async function releaseExpiredReservations(now = new Date().toISOString()) {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stock_reservations")
    .select("id, order_id")
    .is("released_at", null)
    .lt("expires_at", now);
  if (error) throw error;
  const released: string[] = [];
  for (const row of data ?? []) {
    const ids = await releaseOrderStock(admin, row.order_id, row.id, "expired");
    if (ids.length) released.push(row.id);
  }
  return released;
}
