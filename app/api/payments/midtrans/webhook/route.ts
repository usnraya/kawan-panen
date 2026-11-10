import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { verifyMidtransSignature } from "@/lib/midtrans";

type MidtransNotification = {
  order_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
};

function eventKey(payload: MidtransNotification) {
  return createHash("sha256")
    .update(JSON.stringify({
      order_id: payload.order_id,
      status_code: payload.status_code,
      gross_amount: payload.gross_amount,
      transaction_status: payload.transaction_status,
      fraud_status: payload.fraud_status ?? null,
    }))
    .digest("hex");
}

function supportedStatus(payload: MidtransNotification) {
  if (payload.transaction_status === "settlement") return true;
  if (payload.transaction_status === "capture" && payload.fraud_status === "accept") return true;
  return ["expire", "cancel", "deny", "failure"].includes(payload.transaction_status ?? "");
}

export async function POST(request: Request) {
  if (!hasSupabaseAdminEnv()) return NextResponse.json({ error: "Webhook belum dikonfigurasi." }, { status: 503 });

  const payload = (await request.json().catch(() => null)) as MidtransNotification | null;
  if (!payload?.order_id || !payload.status_code || !payload.gross_amount || !payload.signature_key || !payload.transaction_status) {
    return NextResponse.json({ error: "Payload tidak lengkap." }, { status: 400 });
  }

  let valid = false;
  try {
    valid = verifyMidtransSignature({
      orderId: payload.order_id,
      statusCode: payload.status_code,
      grossAmount: payload.gross_amount,
      signatureKey: payload.signature_key,
    });
  } catch {
    valid = false;
  }
  if (!valid) return NextResponse.json({ error: "Signature tidak valid." }, { status: 401 });

  // Challenge/pending notifications are not payment state transitions. Midtrans
  // will send a later settlement/deny/expire notification.
  if (!supportedStatus(payload)) return NextResponse.json({ ok: true });

  const grossAmount = Number(payload.gross_amount);
  if (!Number.isSafeInteger(grossAmount) || grossAmount < 0) {
    return NextResponse.json({ error: "Nominal pembayaran tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("process_payment_webhook", {
    p_event_key: eventKey(payload),
    p_midtrans_order_id: payload.order_id,
    p_payload: payload as Record<string, unknown>,
    p_transaction_status: payload.transaction_status === "capture" ? "capture" : payload.transaction_status,
    p_gross_amount: grossAmount,
  });
  if (error) {
    if (error.message.includes("payment not found")) return NextResponse.json({ error: "Order tidak ditemukan." }, { status: 404 });
    if (error.message.includes("gross amount mismatch")) return NextResponse.json({ error: "Nominal pembayaran tidak sesuai total pesanan." }, { status: 409 });
    return NextResponse.json({ error: "Webhook belum dapat diproses." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, duplicate: Boolean(data?.duplicate) });
}
