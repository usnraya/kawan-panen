import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { postOrderSettlement, postRelease, type SettlementLine } from "@/lib/ledger";
import { assertOrderTransition, assertPaymentTransition, type OrderStatus, type PaymentStatus } from "@/lib/state-machine";

type AdminClient = ReturnType<typeof createAdminClient>;

export class SettlementError extends Error {}

async function loadSettlementLines(admin: AdminClient, orderId: string): Promise<SettlementLine[]> {
  const { data: items } = await admin
    .from("order_items")
    .select("farmer_id, subtotal, buyer_commission, farmer_commission, logistics_fee")
    .eq("order_id", orderId);
  if (!items?.length) throw new SettlementError("Rincian pesanan kosong.");
  return items.map((item) => ({
    subtotal: Number(item.subtotal),
    buyerCommission: Number(item.buyer_commission),
    logisticsFee: Number(item.logistics_fee),
    buyerTotal: Number(item.subtotal) + Number(item.buyer_commission) + Number(item.logistics_fee),
    farmerCommission: Number(item.farmer_commission),
    farmerNet: Number(item.subtotal) - Number(item.farmer_commission),
    platformRevenue: Number(item.buyer_commission) + Number(item.farmer_commission),
    farmerId: item.farmer_id ?? undefined,
  }));
}

/**
 * Settles a paid order: posts the double-entry ledger from the order's frozen
 * item finance snapshot (lib/finance.ts, written at checkout), then moves
 * order/payment to PAID/PAID_HELD. Idempotent on order_id — a unique
 * ledger_transactions.idempotency_key turns a retried or concurrent webhook
 * delivery into a no-op instead of a double settlement.
 */
export async function settlePaidOrder(admin: AdminClient, orderId: string) {
  const { data: order } = await admin.from("orders").select("id, status").eq("id", orderId).single();
  if (!order) throw new SettlementError("Order tidak ditemukan.");

  const { data: payment } = await admin.from("payment_transactions").select("id, status").eq("order_id", orderId).single();
  if (!payment) throw new SettlementError("Transaksi pembayaran tidak ditemukan.");

  if (payment.status !== "UNPAID") return { alreadySettled: true };

  assertOrderTransition(order.status as OrderStatus, "PAID");
  assertPaymentTransition(payment.status as PaymentStatus, "PAID_HELD");

  const lines = await loadSettlementLines(admin, orderId);
  const entries = postOrderSettlement(lines);

  const { data: transaction, error: txError } = await admin
    .from("ledger_transactions")
    .insert({ source_type: "order_settlement", source_id: orderId, idempotency_key: `settlement:${orderId}` })
    .select("id")
    .single();
  if (txError?.code === "23505") return { alreadySettled: true };
  if (txError || !transaction) throw new SettlementError("Pencatatan ledger gagal.");

  const { error: entriesError } = await admin.from("ledger_entries").insert(
    entries.map((entry) => ({
      transaction_id: transaction.id,
      account_code: entry.account,
      debit: entry.debit,
      credit: entry.credit,
      reference: entry.reference ?? null,
    })),
  );
  if (entriesError) throw new SettlementError("Pencatatan ledger gagal.");

  await admin.from("payment_transactions").update({ status: "PAID_HELD" }).eq("order_id", orderId);
  await admin.from("orders").update({ status: "PAID" }).eq("id", orderId);

  return { alreadySettled: false };
}

/** Releases the held settlement once, after buyer receipt confirmation. */
export async function releasePaidOrder(admin: AdminClient, orderId: string) {
  const [{ data: order }, { data: payment }] = await Promise.all([
    admin.from("orders").select("id, status, total_amount").eq("id", orderId).single(),
    admin.from("payment_transactions").select("id, status").eq("order_id", orderId).single(),
  ]);
  if (!order) throw new SettlementError("Order tidak ditemukan.");
  if (!payment) throw new SettlementError("Transaksi pembayaran tidak ditemukan.");
  if (payment.status === "RELEASED" && order.status === "COMPLETED") return { alreadyReleased: true };
  assertOrderTransition(order.status as OrderStatus, "COMPLETED");
  assertPaymentTransition(payment.status as PaymentStatus, "RELEASED");

  const lines = await loadSettlementLines(admin, orderId);
  const entries = postRelease(lines);
  const { data: transaction, error: txError } = await admin
    .from("ledger_transactions")
    .insert({ source_type: "release", source_id: orderId, idempotency_key: `release:${orderId}` })
    .select("id")
    .single();
  if (txError?.code === "23505") return { alreadyReleased: true };
  if (txError || !transaction) throw new SettlementError("Pencatatan pencairan gagal.");

  const { error: entriesError } = await admin.from("ledger_entries").insert(
    entries.map((entry) => ({
      transaction_id: transaction.id,
      account_code: entry.account,
      debit: entry.debit,
      credit: entry.credit,
      reference: entry.reference ?? null,
    })),
  );
  if (entriesError) throw new SettlementError("Pencatatan pencairan gagal.");

  const { error: paymentError } = await admin.from("payment_transactions").update({ status: "RELEASED" }).eq("order_id", orderId).eq("status", payment.status);
  if (paymentError) throw new SettlementError("Status pembayaran gagal diperbarui.");
  const { error: orderError } = await admin.from("orders").update({ status: "COMPLETED" }).eq("id", orderId).eq("status", order.status);
  if (orderError) throw new SettlementError("Status pesanan gagal diperbarui.");
  return { alreadyReleased: false };
}
