"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { releasePaidOrder, SettlementError } from "@/lib/settlement";
import { assertOrderTransition, type OrderStatus } from "@/lib/state-machine";
import { appendEvent } from "@/lib/server/events";

export type OrderActionState = { error?: string; ok?: boolean } | null;

async function requireBuyerOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi login tidak ditemukan." } as const;
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("id, buyer_id, status").eq("id", orderId).single();
  if (!order || order.buyer_id !== user.id) return { error: "Pesanan tidak ditemukan." } as const;
  return { admin, order } as const;
}

export async function confirmReceipt(orderId: string): Promise<OrderActionState> {
  const result = await requireBuyerOrder(orderId);
  if ("error" in result) return result;
  if (result.order.status !== "DELIVERED") return { error: "Pesanan belum berstatus terkirim." };

  try {
    await releasePaidOrder(result.admin, orderId);
  } catch (error) {
    return { error: error instanceof SettlementError || error instanceof Error ? error.message : "Dana belum dapat dicairkan." };
  }
  revalidatePath(`/buyer/orders/${orderId}`);
  revalidatePath("/coordinator/dashboard");
  return { ok: true };
}

export async function fileComplaint(orderId: string, reason: string): Promise<OrderActionState> {
  const result = await requireBuyerOrder(orderId);
  if ("error" in result) return result;
  if (!reason.trim()) return { error: "Alasan komplain wajib diisi." };
  try {
    assertOrderTransition(result.order.status as OrderStatus, "DISPUTED");
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Pesanan tidak dapat dikomplain." };
  }
  const { error } = await result.admin.from("orders").update({ status: "DISPUTED" }).eq("id", orderId).eq("status", result.order.status);
  if (error) return { error: "Komplain gagal disimpan." };
  await appendEvent({ requestId: null, type: "order_dispute_opened", payload: { orderId, reason: reason.trim() } }, result.admin);
  revalidatePath(`/buyer/orders/${orderId}`);
  revalidatePath("/coordinator/disputes");
  return { ok: true };
}
