import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AllocationStatus, RequestStatus } from "@/lib/database.types";

const FALLBACK_CONFIRM_WINDOW_DAYS = 2;

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
      .update({ reserved_kg: Math.max(0, failedForecast.reserved_kg - failedKg) })
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
