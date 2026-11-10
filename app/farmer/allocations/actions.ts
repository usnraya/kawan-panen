"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { triggerFallback } from "@/lib/server/fallback";
import { appendEvent } from "@/lib/server/events";
import type { AllocationStatus } from "@/lib/database.types";

/**
 * Writes go through the admin client, not the farmer's own RLS-scoped client:
 * farmers only have read access to allocations (no owner-wide update policy),
 * so authorization and the PROPOSED->CONFIRMED/DECLINED transition are
 * enforced here instead, mirroring app/coordinator/hub/actions.ts's recordQc.
 */
export async function respondToAllocation(allocationId: string, action: "confirm" | "decline") {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." };

  const admin = createAdminClient();
  const status: AllocationStatus = action === "confirm" ? "CONFIRMED" : "DECLINED";
  const update = action === "confirm" ? { status, confirmed_at: new Date().toISOString() } : { status };
  const { data: allocation, error } = await admin
    .from("allocations")
    .update(update)
    .eq("id", allocationId)
    .eq("farmer_id", user.id)
    .eq("status", "PROPOSED")
    .select("id, request_id, role, forecast_id, committed_kg")
    .single();
  if (error || !allocation) return { error: "Alokasi sudah berubah atau tidak ditemukan." };

  await appendEvent({ requestId: allocation.request_id, type: action === "confirm" ? "confirmed" : "declined", payload: { allocationId } }, admin);

  if (action === "decline" && allocation.role === "primary" && hasSupabaseAdminEnv()) {
    await triggerFallback(allocation.request_id, allocation.forecast_id, allocation.committed_kg, allocation.id);
  }

  revalidatePath("/farmer/allocations");
  revalidatePath(`/buyer/requests/${allocation.request_id}`);
  return { ok: true };
}
