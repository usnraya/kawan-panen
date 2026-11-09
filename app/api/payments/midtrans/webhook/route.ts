import { NextResponse } from "next/server";
import type { OrderStatus, PaymentStatus } from "@/lib/database.types";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { verifyMidtransSignature } from "@/lib/midtrans";
import { settlePaidOrder, SettlementError } from "@/lib/settlement";

type MidtransNotification = {
  order_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
};

function nextStatus(notification: MidtransNotification): { order: OrderStatus; payment: PaymentStatus } | null {
  if (notification.transaction_status === "settlement" || (notification.transaction_status === "capture" && notification.fraud_status !== "deny")) {
    return { order: "PAID", payment: "PAID_HELD" };
  }
  if (["expire", "cancel", "deny", "failure"].includes(notification.transaction_status ?? "")) {
    return { order: "CANCELLED", payment: "REFUNDED" };
  }
  return null;
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: "Webhook belum dikonfigurasi." }, { status: 503 });

  const payload = (await request.json().catch(() => null)) as MidtransNotification | null;
  if (!payload?.order_id || !payload.status_code || !payload.gross_amount || !payload.signature_key) {
    return NextResponse.json({ error: "Payload tidak lengkap." }, { status: 400 });
  }

  let valid = false;
  try {
    valid = verifyMidtransSignature({ orderId: payload.order_id, statusCode: payload.status_code, grossAmount: payload.gross_amount, signatureKey: payload.signature_key });
  } catch {
    valid = false;
  }

  const admin = createAdminClient();
  await admin.from("payment_webhook_events").insert({ midtrans_order_id: payload.order_id, payload: payload as Record<string, unknown>, signature_valid: valid });
  if (!valid) return NextResponse.json({ error: "Signature tidak valid." }, { status: 401 });

  const next = nextStatus(payload);
  if (!next) return NextResponse.json({ ok: true });

  const { data: payment } = await admin.from("payment_transactions").select("order_id, status").eq("midtrans_order_id", payload.order_id).maybeSingle();
  if (!payment) return NextResponse.json({ error: "Order tidak ditemukan." }, { status: 404 });

  const { data: order } = await admin.from("orders").select("status, total_amount").eq("id", payment.order_id).single();
  if (!order) return NextResponse.json({ error: "Order tidak ditemukan." }, { status: 404 });

  const webhookAmount = Number(payload.gross_amount);
  if (!Number.isSafeInteger(webhookAmount) || webhookAmount !== Number(order.total_amount)) {
    return NextResponse.json({ error: "Nominal pembayaran tidak sesuai total pesanan." }, { status: 409 });
  }

  // Midtrans retries are expected. A terminal payment/order is never moved backwards.
  if (payment.status === "RELEASED" || payment.status === "REFUNDED") {
    return NextResponse.json({ ok: true });
  }

  if (next.order === "PAID") {
    if (payment.status === "PAID_HELD" && order.status === "PAID") {
      return NextResponse.json({ ok: true });
    }

    try {
      await settlePaidOrder(admin, payment.order_id);
    } catch (error) {
      if (error instanceof SettlementError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true });
  }

  if (payment.status === next.payment || order.status === next.order) {
    return NextResponse.json({ ok: true });
  }

  await admin.from("payment_transactions").update({ status: next.payment }).eq("midtrans_order_id", payload.order_id);
  await admin.from("orders").update({ status: next.order }).eq("id", payment.order_id);
  await admin.from("stock_reservations").update({ released_at: new Date().toISOString() }).eq("order_id", payment.order_id).is("released_at", null);

  return NextResponse.json({ ok: true });
}
