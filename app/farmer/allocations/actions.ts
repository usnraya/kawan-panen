"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { triggerFallback } from "@/lib/server/fallback";
import type { AllocationStatus } from "@/lib/database.types";

export async function respondToAllocation(allocationId: string, action: "confirm" | "decline") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." };

  const status: AllocationStatus = action === "confirm" ? "CONFIRMED" : "DECLINED";
  const update = action === "confirm" ? { status, confirmed_at: new Date().toISOString() } : { status };
  const { data: allocation, error } = await supabase
    .from("allocations")
    .update(update)
    .eq("id", allocationId)
    .eq("farmer_id", user.id)
    .eq("status", "PROPOSED")
    .select("id, request_id, role, forecast_id, committed_kg")
    .single();
  if (error || !allocation) return { error: "Alokasi sudah berubah atau tidak ditemukan." };

  await supabase.from("events").insert({ request_id: allocation.request_id, type: action === "confirm" ? "confirmed" : "declined", payload: { allocationId } });

  if (action === "decline" && allocation.role === "primary" && hasSupabaseAdminEnv()) {
    await triggerFallback(allocation.request_id, allocation.forecast_id, allocation.committed_kg);
  }

  revalidatePath("/farmer/allocations");
  revalidatePath(`/buyer/requests/${allocation.request_id}`);
  return { ok: true };
}
