"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { triggerFallback } from "@/lib/server/fallback";
import { assertOrderTransition, type OrderStatus } from "@/lib/state-machine";

type CoordinatorAccess =
  | { admin: ReturnType<typeof createAdminClient> }
  | { error: string };

async function requireCoordinator(): Promise<CoordinatorAccess> {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coordinator") return { error: "Hanya koordinator yang boleh melakukan tindakan hub." };
  return { admin: createAdminClient() };
}

export async function verifyForecast(forecastId: string, decision: "verified" | "rejected") {
  if (!forecastId) return { error: "Listing tidak ditemukan." };
  const result = await requireCoordinator();
  if ("error" in result) return result;

  const { error } = await result.admin
    .from("harvest_forecasts")
    .update({ verification_status: decision })
    .eq("id", forecastId)
    .eq("verification_status", "pending");
  if (error) return { error: "Status listing gagal diperbarui." };

  revalidatePath("/coordinator/hub");
  revalidatePath("/buyer/availability");
  return { ok: true };
}

export async function recordQc(
  allocationId: string,
  actualKg: number,
  gradeOk: boolean,
): Promise<{ error: string; ok?: undefined; shortfallKg?: undefined } | { error?: undefined; ok: true; shortfallKg: number }> {
  if (!allocationId || !Number.isFinite(actualKg) || actualKg < 0) {
    return { error: "Berat aktual tidak valid." };
  }
  const result = await requireCoordinator();
  if (!("admin" in result)) return { error: result.error ?? "Akses koordinator ditolak." };

  const { data: allocation } = await result.admin
    .from("allocations")
    .select("id, request_id, forecast_id, committed_kg, status")
    .eq("id", allocationId)
    .in("status", ["CONFIRMED", "PROPOSED"])
    .maybeSingle();
  if (!allocation) return { error: "Alokasi tidak ditemukan atau sudah diperiksa." };
  if (actualKg > Number(allocation.committed_kg)) {
    return { error: "Berat aktual tidak boleh melebihi komitmen alokasi." };
  }

  const { data: { user } } = await createClient().then((client) => client.auth.getUser());
  const { error } = await result.admin
    .from("allocations")
    .update({
      actual_kg: actualKg,
      delivered_kg: actualKg,
      grade_ok: gradeOk,
      qc_checked_by: user?.id ?? null,
      qc_checked_at: new Date().toISOString(),
      status: "DELIVERED",
    })
    .eq("id", allocationId)
    .in("status", ["CONFIRMED", "PROPOSED"]);
  if (error) return { error: "Hasil QC gagal disimpan." };

  const shortfallKg = Number(allocation.committed_kg) - actualKg;
  if (shortfallKg > 0) {
    await triggerFallback(allocation.request_id, allocation.forecast_id, shortfallKg, allocation.id);
  }

  revalidatePath("/coordinator/hub");
  revalidatePath("/coordinator/demo");
  revalidatePath(`/buyer/requests/${allocation.request_id}`);
  revalidatePath("/farmer/allocations");
  return { ok: true, shortfallKg };
}

export async function advanceOrderToHub(orderId: string) {
  return transitionFulfillment(orderId, "AT_HUB");
}

export async function advanceOrderToQcDone(orderId: string) {
  return transitionFulfillment(orderId, "QC_DONE");
}

export async function advanceOrderToInTransit(orderId: string) {
  const result = await transitionFulfillment(orderId, "IN_TRANSIT");
  if ("error" in result) return result;
  const { data: order } = await result.admin.from("orders").select("hub_id").eq("id", orderId).single();
  const { error } = await result.admin.from("deliveries").upsert({
    order_id: orderId,
    hub_id: order?.hub_id ?? null,
    courier_label: "Mitra Logistik Simulasi",
    status: "in_transit",
  }, { onConflict: "order_id" });
  if (error) return { error: "Data pengiriman gagal dibuat." };
  revalidatePath("/coordinator/hub");
  return { ok: true } as const;
}

export async function advanceOrderToDelivered(orderId: string) {
  const result = await transitionFulfillment(orderId, "DELIVERED");
  if ("error" in result) return result;
  const { error } = await result.admin.from("deliveries").update({
    status: "delivered",
    delivered_at: new Date().toISOString(),
  }).eq("order_id", orderId).eq("status", "in_transit");
  if (error) return { error: "Status pengiriman gagal diperbarui." };
  revalidatePath("/coordinator/hub");
  return { ok: true } as const;
}

async function transitionFulfillment(orderId: string, nextStatus: OrderStatus) {
  if (!orderId) return { error: "Pesanan tidak ditemukan." } as const;
  const access = await requireCoordinator();
  if ("error" in access) return access;
  const { data: order } = await access.admin.from("orders").select("status").eq("id", orderId).single();
  if (!order) return { error: "Pesanan tidak ditemukan." } as const;
  try {
    assertOrderTransition(order.status as OrderStatus, nextStatus);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Transisi pesanan tidak valid." } as const;
  }
  const { error } = await access.admin.from("orders").update({ status: nextStatus }).eq("id", orderId).eq("status", order.status);
  if (error) return { error: "Status pesanan gagal diperbarui." } as const;
  revalidatePath("/coordinator/hub");
  revalidatePath(`/buyer/orders/${orderId}`);
  return { ok: true, admin: access.admin } as const;
}
