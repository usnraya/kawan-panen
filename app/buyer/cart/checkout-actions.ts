"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolvePaymentProvider } from "@/lib/payment-config";
import { CommerceError, createCheckout } from "@/lib/commerce";
import { settlePaidOrder, SettlementError } from "@/lib/settlement";

export type CheckoutActionState = { error?: string } | null;

export async function checkout(): Promise<CheckoutActionState> {
  let orderId: string;
  try {
    const result = await createCheckout();
    orderId = result.orderId;
  } catch (error) {
    if (error instanceof CommerceError && error.message === "UNAUTHENTICATED") {
      return { error: "LOGIN_REQUIRED" };
    }
    return { error: error instanceof Error ? error.message : "Checkout gagal. Coba lagi." };
  }
  redirect(`/buyer/orders/${orderId}`);
}

/**
 * Demo-only confirm for the mock payment provider (no MIDTRANS_SERVER_KEY):
 * MockProvider never fires a real webhook, so this is the equivalent trigger a
 * buyer presses in the sandbox demo. Real Midtrans orders settle only from the
 * verified webhook (app/api/payments/midtrans/webhook/route.ts) — never here.
 */
export async function confirmMockPayment(orderId: string): Promise<CheckoutActionState> {
  try {
    if (resolvePaymentProvider() !== "mock") {
      return { error: "Simulasi pembayaran tidak aktif pada environment ini." };
    }
  } catch {
    return { error: "Payment provider belum dikonfigurasi." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "LOGIN_REQUIRED" };

  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("buyer_id").eq("id", orderId).single();
  if (!order || order.buyer_id !== user.id) return { error: "Pesanan tidak ditemukan." };

  const { data: payment } = await admin.from("payment_transactions").select("provider").eq("order_id", orderId).maybeSingle();
  if (payment?.provider !== "mock") return { error: "Hanya transaksi simulasi yang dapat dikonfirmasi di sini." };

  try {
    await settlePaidOrder(admin, orderId);
  } catch (error) {
    return { error: error instanceof SettlementError ? error.message : "Pembayaran simulasi gagal." };
  }
  revalidatePath(`/buyer/orders/${orderId}`);
  return null;
}
