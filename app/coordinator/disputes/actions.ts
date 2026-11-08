"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { refundOrder, RefundError } from "@/lib/refund";
import { assertOrderTransition } from "@/lib/state-machine";

export type DisputeActionState = { error?: string; ok?: boolean } | null;

async function requireCoordinator() {
  if (!hasSupabaseAdminEnv()) return { error: "Supabase belum dikonfigurasi." } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." } as const;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "coordinator") return { error: "Hanya koordinator yang boleh memproses komplain." } as const;
  return { admin: createAdminClient() } as const;
}

export async function resolveDispute(
  orderId: string,
  decision: "refund_full" | "refund_partial" | "reject",
  partialAmount?: number,
): Promise<DisputeActionState> {
  if (!orderId) return { error: "Pesanan tidak ditemukan." };
  const access = await requireCoordinator();
  if ("error" in access) return access;

  const { data: order } = await access.admin.from("orders").select("id, status").eq("id", orderId).single();
  if (!order || order.status !== "DISPUTED") return { error: "Komplain tidak ditemukan atau sudah diproses." };

  try {
    if (decision === "reject") {
      assertOrderTransition(order.status, "COMPLETED");
      const { error } = await access.admin.from("orders").update({ status: "COMPLETED" }).eq("id", orderId).eq("status", "DISPUTED");
      if (error) return { error: "Komplain gagal ditutup." };
    } else {
      const result = await refundOrder(access.admin, orderId, decision === "refund_partial" ? partialAmount : undefined);
      const nextOrderStatus = result.status === "REFUNDED" ? "CANCELLED" : "COMPLETED";
      assertOrderTransition(order.status, nextOrderStatus);
      const { error } = await access.admin.from("orders").update({ status: nextOrderStatus }).eq("id", orderId).eq("status", "DISPUTED");
      if (error) return { error: "Refund tercatat, tetapi status pesanan gagal diperbarui." };
    }
  } catch (error) {
    if (error instanceof RefundError || error instanceof Error) return { error: error.message };
    return { error: "Komplain gagal diproses." };
  }

  revalidatePath("/coordinator/disputes");
  revalidatePath(`/buyer/orders/${orderId}`);
  revalidatePath("/coordinator/dashboard");
  return { ok: true };
}
