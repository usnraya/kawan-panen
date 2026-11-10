import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseExpiredReservations as releaseExpiredReservationsRpc } from "@/lib/server/reservation";

export { releaseKg } from "@/lib/server/reservation";

/**
 * Primary allocation failed (declined/expired/QC shortfall). `process_allocation_fallback`
 * claims the failed allocation, releases its reserved stock, promotes STANDBY backups,
 * and updates the request — all in one PostgreSQL transaction. Concurrent callers for
 * the same allocation get `duplicate: true` and do no further work.
 */
export async function triggerFallback(requestId: string, failedForecastId: string, failedKg: number, allocationId?: string) {
  const admin = createAdminClient();
  if (!allocationId) {
    // Legacy call sites without the allocation id: resolve the PROPOSED/FAILED primary row.
    const { data: allocation } = await admin
      .from("allocations")
      .select("id")
      .eq("request_id", requestId)
      .eq("forecast_id", failedForecastId)
      .eq("role", "primary")
      .in("status", ["PROPOSED", "FAILED", "EXPIRED"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    allocationId = allocation?.id;
  }
  if (!allocationId) return { promotedCount: 0, remainingKg: failedKg };

  const { data, error } = await admin.rpc("process_allocation_fallback", {
    p_allocation_id: allocationId,
    p_event_key: `fallback:${allocationId}`,
    p_shortfall_kg: failedKg,
  });
  if (error) throw error;
  return { promotedCount: Number(data?.promoted_count ?? 0), remainingKg: Number(data?.remaining_kg ?? 0) };
}

/** Expire PROPOSED allocations past their confirm_deadline; only the claim winner runs fallback. */
export async function checkConfirmDeadlines() {
  const admin = createAdminClient();
  const { data: candidates } = await admin
    .from("allocations")
    .select("id, request_id, forecast_id, committed_kg")
    .eq("status", "PROPOSED")
    .lt("confirm_deadline", new Date().toISOString());

  const results = [];
  for (const candidate of candidates ?? []) {
    const { data: claim, error } = await admin.rpc("claim_expired_allocation", { p_allocation_id: candidate.id });
    if (error) throw error;
    if (!claim?.claimed) continue;
    const outcome = await triggerFallback(candidate.request_id, candidate.forecast_id, candidate.committed_kg, candidate.id);
    results.push({ allocationId: candidate.id, requestId: candidate.request_id, ...outcome });
  }
  return results;
}

export async function releaseExpiredReservations(now = new Date().toISOString()) {
  return releaseExpiredReservationsRpc(now);
}

export async function runOperationalSweep() {
  const [reservations, deadlines] = await Promise.all([
    releaseExpiredReservations(),
    checkConfirmDeadlines(),
  ]);
  return { reservationsReleased: reservations.length, deadlinesChecked: deadlines.length };
}
