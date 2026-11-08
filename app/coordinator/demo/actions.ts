"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { checkConfirmDeadlines, triggerFallback } from "@/lib/server/fallback";

export async function runDeadlineCheck() {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." };
  const results = await checkConfirmDeadlines();
  revalidatePath("/coordinator/demo");
  revalidatePath("/buyer/requests");
  return { ok: true, count: results.length };
}

export async function simulatePrimaryFailure() {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." };
  const admin = createAdminClient();
  const { data: allocation } = await admin
    .from("allocations")
    .select("id, request_id, forecast_id, committed_kg")
    .eq("role", "primary")
    .eq("status", "PROPOSED")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!allocation) return { error: "Tidak ada alokasi utama yang menunggu konfirmasi." };

  await admin.from("allocations").update({ status: "FAILED" }).eq("id", allocation.id);
  await triggerFallback(allocation.request_id, allocation.forecast_id, allocation.committed_kg);
  revalidatePath("/coordinator/demo");
  revalidatePath("/buyer/requests");
  revalidatePath(`/buyer/requests/${allocation.request_id}`);
  return { ok: true };
}
