import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { postRefund } from "@/lib/ledger";
import { assertPaymentTransition, type PaymentStatus } from "@/lib/state-machine";

type AdminClient = ReturnType<typeof createAdminClient>;

export class RefundError extends Error {}

type RefundResult = {
  alreadyRefunded: boolean;
  amount: number;
  remaining: number;
  status: "PARTIALLY_REFUNDED" | "REFUNDED";
};

/** Posts an idempotent refund against the order's frozen total. */
export async function refundOrder(admin: AdminClient, orderId: string, requestedAmount?: number): Promise<RefundResult> {
  const [{ data: order }, { data: payment }] = await Promise.all([
    admin.from("orders").select("id, total_amount, status").eq("id", orderId).single(),
    admin.from("payment_transactions").select("id, status").eq("order_id", orderId).single(),
  ]);
  if (!order) throw new RefundError("Pesanan tidak ditemukan.");
  if (!payment) throw new RefundError("Transaksi pembayaran tidak ditemukan.");
  if (payment.status !== "PAID_HELD" && payment.status !== "PARTIALLY_REFUNDED") {
    throw new RefundError("Pesanan ini tidak memiliki dana yang dapat direfund.");
  }

  const { data: refundTransactions } = await admin
    .from("ledger_transactions")
    .select("id")
    .eq("source_type", "refund")
    .eq("source_id", orderId);
  const transactionIds = (refundTransactions ?? []).map((row) => row.id);
  let refunded = 0;
  if (transactionIds.length > 0) {
    const { data: refundEntries } = await admin
      .from("ledger_entries")
      .select("account_code, debit")
      .in("transaction_id", transactionIds)
      .eq("account_code", "buyer_refund");
    refunded = (refundEntries ?? []).reduce((sum, entry) => sum + Number(entry.debit), 0);
  }

  const total = Number(order.total_amount);
  const remaining = total - refunded;
  if (!Number.isInteger(remaining) || remaining <= 0) throw new RefundError("Dana pesanan sudah seluruhnya direfund.");
  const amount = requestedAmount === undefined ? remaining : requestedAmount;
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) {
    throw new RefundError(`Nominal refund harus berupa Rupiah bulat antara 1 dan ${remaining}.`);
  }

  const nextStatus: "PARTIALLY_REFUNDED" | "REFUNDED" = amount === remaining ? "REFUNDED" : "PARTIALLY_REFUNDED";
  assertPaymentTransition(payment.status as PaymentStatus, nextStatus);
  const idempotencyKey = `refund:${orderId}:${amount}`;
  const { data: transaction, error: transactionError } = await admin
    .from("ledger_transactions")
    .insert({ source_type: "refund", source_id: orderId, idempotency_key: idempotencyKey })
    .select("id")
    .single();
  if (transactionError?.code === "23505") {
    return { alreadyRefunded: true, amount, remaining: Math.max(0, remaining - amount), status: nextStatus };
  }
  if (transactionError || !transaction) throw new RefundError("Pencatatan refund gagal.");

  const entries = postRefund(amount, orderId);
  const { error: entriesError } = await admin.from("ledger_entries").insert(
    entries.map((entry) => ({
      transaction_id: transaction.id,
      account_code: entry.account,
      debit: entry.debit,
      credit: entry.credit,
      reference: entry.reference ?? null,
    })),
  );
  if (entriesError) throw new RefundError("Pencatatan refund gagal.");

  const { error: paymentError } = await admin
    .from("payment_transactions")
    .update({ status: nextStatus })
    .eq("order_id", orderId)
    .eq("status", payment.status);
  if (paymentError) throw new RefundError("Status pembayaran gagal diperbarui.");

  return { alreadyRefunded: false, amount, remaining: remaining - amount, status: nextStatus };
}
