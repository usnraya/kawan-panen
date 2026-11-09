import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AllocationStatus, RequestStatus } from "@/lib/database.types";
import { canTransitionOrder, type OrderStatus } from "@/lib/state-machine";

const FALLBACK_CONFIRM_WINDOW_DAYS = 2;

import { releaseKg } from "@/lib/server/reservation";

export { releaseKg } from "@/lib/server/reservation";

/**
 * Primary allocation failed (declined/expired). Release its reserved stock,
 * promote STANDBY backups (oldest first) to PROPOSED until the lost kg is
 * covered, and reflect the outcome on the request.
 */
export async function triggerFallback(requestId: string, failedForecastId: string, failedKg: number) {
  const admin = createAdminClient();

  const { data: failedForecast } = await admin
    .from("harvest_forecasts")
    .select("id, reserved_kg")
    .eq("id", failedForecastId)
    .maybeSingle();
  if (failedForecast) {
    await admin
      .from("harvest_forecasts")
      .update({ reserved_kg: releaseKg(failedForecast.reserved_kg, failedKg) })
      .eq("id", failedForecast.id);
  }

  const { data: standby } = await admin
    .from("allocations")
    .select("id, forecast_id, committed_kg")
    .eq("request_id", requestId)
    .eq("role", "backup")
    .eq("status", "STANDBY")
    .order("created_at");

  let remaining = failedKg;
  const promotedIds: string[] = [];
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + FALLBACK_CONFIRM_WINDOW_DAYS);

  for (const backup of standby ?? []) {
    if (remaining <= 0) break;
    await admin
      .from("allocations")
      .update({ status: "PROPOSED" as AllocationStatus, confirm_deadline: deadline.toISOString() })
      .eq("id", backup.id);
    const { data: forecast } = await admin
      .from("harvest_forecasts")
      .select("reserved_kg")
      .eq("id", backup.forecast_id)
      .maybeSingle();
    if (forecast) {
      await admin
        .from("harvest_forecasts")
        .update({ reserved_kg: forecast.reserved_kg + backup.committed_kg })
        .eq("id", backup.forecast_id);
    }
    promotedIds.push(backup.id);
    remaining -= backup.committed_kg;
  }

  const newStatus: RequestStatus = promotedIds.length > 0 ? "FALLBACK_ACTIVE" : "PARTIAL";
  await admin
    .from("buyer_requests")
    .update({ status: newStatus, shortfall_kg: Math.max(0, remaining) })
    .eq("id", requestId);

  await admin.from("events").insert({
    request_id: requestId,
    type: "fallback_triggered",
    payload: { failedKg, promotedCount: promotedIds.length },
  });
  if (promotedIds.length > 0) {
    await admin.from("events").insert({
      request_id: requestId,
      type: "backup_promoted",
      payload: { allocationIds: promotedIds },
    });
  }

  return { promotedCount: promotedIds.length, remainingKg: Math.max(0, remaining) };
}

/** Expire PROPOSED allocations past their confirm_deadline and run fallback for each. */
export async function checkConfirmDeadlines() {
  const admin = createAdminClient();
  const { data: expired } = await admin
    .from("allocations")
    .select("id, request_id, forecast_id, committed_kg")
    .eq("status", "PROPOSED")
    .lt("confirm_deadline", new Date().toISOString());

  const results = [];
  for (const allocation of expired ?? []) {
    await admin.from("allocations").update({ status: "EXPIRED" as AllocationStatus }).eq("id", allocation.id);
    await admin.from("events").insert({ request_id: allocation.request_id, type: "expired", payload: { allocationId: allocation.id } });
    const outcome = await triggerFallback(allocation.request_id, allocation.forecast_id, allocation.committed_kg);
    results.push({ allocationId: allocation.id, requestId: allocation.request_id, ...outcome });
  }
  return results;
}

type ExpiredReservation = {
  id: string;
  order_id: string;
  product_id: string;
  qty_kg: number;
};

type ExpiredOrderItem = {
  allocation_id: string | null;
  qty_kg: number;
};

/**
 * Releases unpaid checkout reservations after their short hold window.
 * The service-role client is intentional: this is a server sweep, never a
 * buyer-controlled mutation. Updates are guarded by released_at/status so a
 * retry cannot release the same stock twice.
 */
export async function releaseExpiredReservations(now = new Date().toISOString()) {
  const admin = createAdminClient();
  const { data: reservations, error } = await admin
    .from("stock_reservations")
    .select("id, order_id, product_id, qty_kg")
    .is("released_at", null)
    .lt("expires_at", now);
  if (error) throw error;

  const released: string[] = [];
  for (const reservation of (reservations ?? []) as ExpiredReservation[]) {
    const { data: payment } = await admin
      .from("payment_transactions")
      .select("status")
      .eq("order_id", reservation.order_id)
      .maybeSingle();
    if (payment?.status !== "UNPAID") continue;

    const { data: order } = await admin
      .from("orders")
      .select("id, status")
      .eq("id", reservation.order_id)
      .single();
    if (!order || !canTransitionOrder(order.status as OrderStatus, "CANCELLED")) continue;

    const { data: orderItems } = await admin
      .from("order_items")
      .select("allocation_id, qty_kg")
      .eq("order_id", reservation.order_id)
      .eq("product_id", reservation.product_id)
      .not("allocation_id", "is", null);
    let remainingKg = Number(reservation.qty_kg);
    for (const item of (orderItems ?? []) as ExpiredOrderItem[]) {
      if (remainingKg <= 0 || !item.allocation_id) break;
      const { data: allocation } = await admin
        .from("allocations")
        .select("forecast_id, committed_kg")
        .eq("id", item.allocation_id)
        .single();
      if (!allocation) continue;
      const releasedKg = Math.min(remainingKg, Number(item.qty_kg));
      const { data: forecast } = await admin
        .from("harvest_forecasts")
        .select("reserved_kg")
        .eq("id", allocation.forecast_id)
        .single();
      if (forecast) {
        await admin
          .from("harvest_forecasts")
          .update({ reserved_kg: releaseKg(Number(forecast.reserved_kg), releasedKg) })
          .eq("id", allocation.forecast_id);
      }
      remainingKg -= releasedKg;
    }

    // Claim after stock accounting. The released_at predicate prevents a
    // concurrent sweep from processing this reservation twice.
    const { data: marked } = await admin
      .from("stock_reservations")
      .update({ released_at: now })
      .eq("id", reservation.id)
      .is("released_at", null)
      .select("id")
      .maybeSingle();
    if (!marked) continue;

    await admin.from("orders").update({ status: "CANCELLED" }).eq("id", reservation.order_id).eq("status", order.status);
    await admin.from("events").insert({
      request_id: null,
      type: "reservation_expired",
      payload: { orderId: reservation.order_id, reservationId: reservation.id },
    });
    released.push(reservation.id);
  }
  return released;
}

export async function runOperationalSweep() {
  const [reservations, deadlines] = await Promise.all([
    releaseExpiredReservations(),
    checkConfirmDeadlines(),
  ]);
  return { reservationsReleased: reservations.length, deadlinesChecked: deadlines.length };
}

// ponytail: replace this loop with one Postgres RPC when reservation volume
// requires atomic bulk accounting across stock, reservation, and order state.
