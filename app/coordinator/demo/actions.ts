"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { checkConfirmDeadlines, triggerFallback } from "@/lib/server/fallback";

async function requireCoordinator() {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coordinator") return { error: "Hanya koordinator yang boleh menjalankan simulasi." } as const;
  return { ok: true } as const;
}

export async function runDeadlineCheck() {
  const access = await requireCoordinator();
  if ("error" in access) return access;
  const results = await checkConfirmDeadlines();
  revalidatePath("/coordinator/demo");
  revalidatePath("/buyer/requests");
  return { ok: true, count: results.length };
}

export async function simulatePrimaryFailure() {
  const access = await requireCoordinator();
  if ("error" in access) return access;
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

  // process_allocation_fallback itself transitions PROPOSED -> FAILED and is
  // idempotent on event_key, so this is a single atomic call rather than a
  // separate status update that could race with/precede the fallback.
  await triggerFallback(allocation.request_id, allocation.forecast_id, allocation.committed_kg, allocation.id);
  revalidatePath("/coordinator/demo");
  revalidatePath("/buyer/requests");
  revalidatePath(`/buyer/requests/${allocation.request_id}`);
  return { ok: true };
}
