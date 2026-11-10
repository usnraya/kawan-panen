import "server-only";

import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { addDaysIso, CATALOG_PRODUCTS, DELIVERY_LEAD_DAYS, isCatalogDate, MIN_ORDER_KG, type CatalogProduct } from "@/lib/catalog-data";
import { randomUUID } from "node:crypto";
import { previewMatch } from "@/app/buyer/requests/actions";
import { assertPaymentItemsTotal, buildPaymentItems } from "@/lib/finance";
import { getPaymentProvider } from "@/lib/payments";
import { resolvePaymentProvider } from "@/lib/payment-config";

// Server-only cart module. Catalog metadata renders the storefront; checkout
// trusts only verified harvest forecasts, matching, and server-side finance.

export class CommerceError extends Error {}

function databaseErrorMessage(error: { code?: string } | null | undefined) {
  if (error?.code === "PGRST205") {
    return "Fitur keranjang belum aktif di server. Migration M7 belum diterapkan ke Supabase.";
  }
  return "Keranjang belum dapat diperbarui. Coba lagi.";
}

export type CartLine = {
  productId: string;
  name: string;
  image: string;
  imageAlt: string;
  grade: CatalogProduct["grade"];
  supplier: string;
  unitPrice: number;
  qtyKg: number;
  subtotal: number;
  availableKg: number;
  /** Rule-based matchability of qtyKg against live verified forecasts, checked before checkout. */
  matchableKg: number;
  shortfallKg: number;
};

export type CartView = { lines: CartLine[]; total: number; stockCheckError?: string };

type AdminClient = ReturnType<typeof createAdminClient>;

function findProduct(productId: string) {
  const product = CATALOG_PRODUCTS.find((item) => item.id === productId);
  if (!product) throw new CommerceError("Produk tidak ditemukan.");
  return product;
}

async function requireBuyer() {
  if (!hasSupabaseEnv() || !hasSupabaseAdminEnv()) {
    throw new CommerceError("Keranjang belum aktif karena konfigurasi server belum lengkap.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new CommerceError("UNAUTHENTICATED");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "buyer") throw new CommerceError("Hanya buyer yang dapat berbelanja.");

  return { userId: user.id, admin: createAdminClient() };
}

async function getActiveCartId(admin: AdminClient, buyerId: string, create: false): Promise<string | null>;
async function getActiveCartId(admin: AdminClient, buyerId: string, create: true): Promise<string>;
async function getActiveCartId(admin: AdminClient, buyerId: string, create: boolean) {
  const { data: existing } = await admin
    .from("carts")
    .select("id")
    .eq("buyer_id", buyerId)
    .eq("status", "active")
    .maybeSingle();
  if (existing) return existing.id;
  if (!create) return null;

  const { data: created, error } = await admin
    .from("carts")
    .insert({ buyer_id: buyerId })
    .select("id")
    .single();
  if (error || !created) throw new CommerceError(databaseErrorMessage(error));
  return created.id;
}

async function findCommodityId(admin: AdminClient, product: CatalogProduct) {
  const { data, error } = await admin.from("commodities").select("id").eq("name", product.commodityName).single();
  if (error || !data) throw new CommerceError(`Komoditas ${product.commodityName} belum tersedia.`);
  return data.id;
}

export async function addCartItem(productId: string, qtyKg: number) {
  const product = findProduct(productId);
  if (!Number.isInteger(qtyKg) || qtyKg < MIN_ORDER_KG) {
    throw new CommerceError(`Minimum pembelian ${MIN_ORDER_KG} kg per produk.`);
  }

  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, true);
  const commodityId = await findCommodityId(admin, product);

  const { data: existingItem } = await admin
    .from("cart_items")
    .select("qty_kg")
    .eq("cart_id", cartId)
    .eq("product_id", productId)
    .maybeSingle();

  const nextQty = Math.min((existingItem?.qty_kg ?? 0) + qtyKg, product.availableKg);
  const { error } = await admin
    .from("cart_items")
    .upsert({ cart_id: cartId, product_id: productId, commodity_id: commodityId, qty_kg: nextQty }, { onConflict: "cart_id,product_id" });
  if (error) throw new CommerceError(databaseErrorMessage(error));
}

export async function updateCartItem(productId: string, qtyKg: number) {
  const product = findProduct(productId);
  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, false);
  if (!cartId) return;

  if (!Number.isInteger(qtyKg) || qtyKg < MIN_ORDER_KG) {
    throw new CommerceError(`Minimum pembelian ${MIN_ORDER_KG} kg per produk.`);
  }

  const qty = Math.min(qtyKg, product.availableKg);
  const { error } = await admin
    .from("cart_items")
    .update({ qty_kg: qty })
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  if (error) throw new CommerceError(databaseErrorMessage(error));
}

export async function removeCartItem(productId: string) {
  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, false);
  if (!cartId) return;
  await admin.from("cart_items").delete().eq("cart_id", cartId).eq("product_id", productId);
}

export async function getCartView(): Promise<CartView> {
  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, false);
  if (!cartId) return { lines: [], total: 0 };

  const { data: items } = await admin.from("cart_items").select("product_id, qty_kg").eq("cart_id", cartId);
  const lines: CartLine[] = [];
  for (const item of items ?? []) {
    const product = CATALOG_PRODUCTS.find((entry) => entry.id === item.product_id);
    if (!product) continue;
    const qtyKg = Number(item.qty_kg);
    const commodityId = await findCommodityId(admin, product);
    const result = await previewMatch({ buyerId: userId, commodityId, qtyKg, deliveryDate: dateForProduct(product), minGrade: product.grade });
    lines.push({
      productId: product.id,
      name: product.name,
      image: product.image,
      imageAlt: product.imageAlt,
      grade: product.grade,
      supplier: product.supplier,
      unitPrice: product.pricePerKg,
      qtyKg,
      subtotal: Math.round(product.pricePerKg * qtyKg),
      availableKg: product.availableKg,
      matchableKg: Math.max(0, qtyKg - result.shortfallKg),
      shortfallKg: result.shortfallKg,
    });
  }

  return { lines, total: lines.reduce((sum, line) => sum + line.subtotal, 0) };
}

export async function getCartCount(): Promise<number> {
  try {
    const { lines } = await getCartView();
    return lines.length;
  } catch {
    return 0;
  }
}

const RESERVATION_MINUTES = 30;

type CheckoutResult = { orderId: string; snapToken: string | null; provider: "mock" | "midtrans" };
type CheckoutLine = {
  productId: string;
  productName: string;
  commodityId: string;
  qtyKg: number;
  deliveryDate: string;
  minGrade: CatalogProduct["grade"];
  allocations: Array<{ forecast_id: string; farmer_id: string; role: "primary" | "backup"; committed_kg: number }>;
};

type RpcCheckout = { order_id: string; total_amount: number; existing: boolean };
type RpcPayment = { payment_id: string; state: "READY" | "CLAIMED" | "IN_PROGRESS"; reference?: string; snap_token?: string | null; provider: "mock" | "midtrans" };

/** Delivery date buyers request: harvest date + QC/logistics buffer, never the harvest day
 *  itself (matching requires forecast.harvestDate <= deliveryDate - harvestLeadDays). */
export function dateForProduct(product: CatalogProduct) {
  if (!isCatalogDate(product.harvestDate)) {
    throw new CommerceError(`Tanggal panen ${product.name} tidak valid.`);
  }
  return addDaysIso(product.harvestDate, DELIVERY_LEAD_DAYS);
}

async function buildCheckoutLines(admin: AdminClient, buyerId: string, items: Array<{ product_id: string; qty_kg: number; commodity_id: string | null }>): Promise<CheckoutLine[]> {
  const lines: CheckoutLine[] = [];
  for (const item of items) {
    const product = findProduct(item.product_id);
    const commodityId = item.commodity_id ?? await findCommodityId(admin, product);
    const qtyKg = Number(item.qty_kg);
    if (!Number.isInteger(qtyKg) || qtyKg < MIN_ORDER_KG) throw new CommerceError(`Jumlah ${product.name} tidak valid.`);
    const deliveryDate = dateForProduct(product);
    const result = await previewMatch({ buyerId, commodityId, qtyKg, deliveryDate, minGrade: product.grade });
    if (result.shortfallKg > 0) throw new CommerceError(`${product.name} belum memiliki stok tervalidasi ${result.shortfallKg} kg.`);
    lines.push({
      productId: product.id,
      productName: product.name,
      commodityId,
      qtyKg,
      deliveryDate,
      minGrade: product.grade,
      allocations: result.allocations.map((allocation) => ({
        forecast_id: allocation.forecastId,
        farmer_id: allocation.farmerId,
        role: allocation.role,
        committed_kg: allocation.kg,
      })),
    });
  }
  return lines;
}

/** Atomic DB preparation, leased provider creation, then guarded finalization. */
export async function createCheckout(): Promise<CheckoutResult> {
  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, false);
  if (!cartId) throw new CommerceError("Keranjang kosong.");
  const { data: items, error: itemsError } = await admin.from("cart_items").select("product_id, commodity_id, qty_kg").eq("cart_id", cartId);
  if (itemsError) throw new CommerceError(databaseErrorMessage(itemsError));
  if (!items?.length) throw new CommerceError("Keranjang kosong.");

  const lines = await buildCheckoutLines(admin, userId, items);
  const providerKind = resolvePaymentProvider();
  const checkoutKey = cartId;
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString();
  const { data: prepared, error: prepareError } = await admin.rpc("prepare_checkout", {
    p_buyer_id: userId,
    p_cart_id: cartId,
    p_checkout_key: checkoutKey,
    p_lines: lines,
    p_expires_at: expiresAt,
    p_provider: providerKind,
  });
  if (prepareError || !prepared) throw new CommerceError(prepareError?.message ?? "Checkout gagal disiapkan.");
  const checkout = prepared as unknown as RpcCheckout;
  const orderId = checkout.order_id;
  const totalAmount = Number(checkout.total_amount);

  const { data: itemRows, error: itemRowsError } = await admin.from("order_items")
    .select("product_id, product_name, unit_price, qty_kg, buyer_commission, logistics_fee")
    .eq("order_id", orderId);
  if (itemRowsError || !itemRows?.length) throw new CommerceError("Rincian pesanan tidak tersedia.");
  const paymentItems = buildPaymentItems(itemRows.map((item) => ({
    productId: item.product_id,
    productName: item.product_name,
    unitPrice: Number(item.unit_price),
    qtyKg: Number(item.qty_kg),
    buyerCommission: Number(item.buyer_commission),
    logisticsFee: Number(item.logistics_fee),
  })));
  try { assertPaymentItemsTotal(paymentItems, totalAmount); }
  catch (error) { throw new CommerceError(error instanceof Error ? error.message : "Rincian pembayaran tidak valid."); }

  const claimToken = randomUUID();
  const { data: claim, error: claimError } = await admin.rpc("claim_payment_creation", {
    p_order_id: orderId,
    p_claim_token: claimToken,
  });
  if (claimError || !claim) throw new CommerceError(claimError?.message ?? "Payment intent gagal diklaim.");
  const paymentClaim = claim as unknown as RpcPayment;
  if (paymentClaim.state === "READY") {
    return { orderId, snapToken: paymentClaim.snap_token ?? null, provider: paymentClaim.provider };
  }
  if (paymentClaim.state === "IN_PROGRESS") {
    return { orderId, snapToken: null, provider: paymentClaim.provider };
  }

  const payment = await getPaymentProvider().createPayment({ orderId, grossAmount: totalAmount, items: paymentItems });
  const { data: finalized, error: finalizeError } = await admin.rpc("finalize_payment_creation", {
    p_payment_id: paymentClaim.payment_id,
    p_claim_token: claimToken,
    p_provider: payment.provider,
    p_reference: payment.reference,
    p_snap_token: payment.token,
    p_raw_response: { reference: payment.reference, provider: payment.provider },
  });
  if (finalizeError || !finalized) throw new CommerceError(finalizeError?.message ?? "Transaksi pembayaran gagal disimpan.");
  return { orderId, snapToken: finalized.snap_token ?? null, provider: finalized.provider };
}
