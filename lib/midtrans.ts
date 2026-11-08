import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export type MidtransSnapResponse = {
  token?: string;
  redirect_url?: string;
};

function getServerKey() {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("Midtrans belum dikonfigurasi.");
  return key;
}

export function getMidtransClientKey() {
  return process.env.MIDTRANS_CLIENT_KEY ?? "";
}

export async function createSnapTransaction(input: {
  orderId: string;
  grossAmount: number;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
}) {
  const serverKey = getServerKey();
  const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
  const endpoint = isProduction
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      transaction_details: { order_id: input.orderId, gross_amount: input.grossAmount },
      item_details: input.items,
    }),
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as MidtransSnapResponse | null;
  if (!response.ok || !body?.token) {
    throw new Error("Midtrans tidak dapat membuat sesi pembayaran.");
  }
  return body;
}

export function verifyMidtransSignature(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}) {
  const serverKey = getServerKey();
  const expected = createHash("sha512")
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${serverKey}`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(input.signatureKey);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}
