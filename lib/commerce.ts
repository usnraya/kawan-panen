import "server-only";

import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { addDaysIso, CATALOG_PRODUCTS, DELIVERY_LEAD_DAYS, isCatalogDate, MIN_ORDER_KG, type CatalogProduct } from "@/lib/catalog-data";
import { previewMatch, runMatching } from "@/app/buyer/requests/actions";
import { assertPaymentItemsTotal, buildPaymentItems, calcOrderLineFinance, type CommerceSettings } from "@/lib/finance";
import { getPaymentProvider } from "@/lib/payments";
import type { Database } from "@/lib/database.types";

type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];
type StockReservationInsert = Database["public"]["Tables"]["stock_reservations"]["Insert"];

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
const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  farmerCommissionBps: 300,
  buyerCommissionBps: 300,
  logisticsPerKg: 1500,
  priceFloorMultiplier: 1.2,
};

type CheckoutResult = { orderId: string; snapToken: string | null; provider: "mock" | "midtrans" };
type MatchedLine = {
  product: CatalogProduct;
  qtyKg: number;
  commodityId: string;
  requestId: string;
  deliveryDate: string;
};
type ForecastRow = { id: string; price_per_kg: number | null; grade: CatalogProduct["grade"]; hub_id: string | null };
type AllocationRow = { id: string; request_id: string; forecast_id: string; farmer_id: string; committed_kg: number };
type ProfileRow = { id: string; display_name: string; org_name: string | null };

function readCommerceSettings(value: unknown): CommerceSettings {
  if (!value || typeof value !== "object") return DEFAULT_COMMERCE_SETTINGS;
  const row = value as Record<string, unknown>;
  const number = (key: keyof CommerceSettings) => typeof row[key] === "number" && Number.isFinite(row[key]) ? Number(row[key]) : DEFAULT_COMMERCE_SETTINGS[key];
  return {
    farmerCommissionBps: number("farmerCommissionBps"),
    buyerCommissionBps: number("buyerCommissionBps"),
    logisticsPerKg: number("logisticsPerKg"),
    priceFloorMultiplier: number("priceFloorMultiplier"),
  };
}

/** Delivery date buyers request: harvest date + QC/logistics buffer, never the harvest day
 *  itself (matching requires forecast.harvestDate <= deliveryDate - harvestLeadDays). */
export function dateForProduct(product: CatalogProduct) {
  if (!isCatalogDate(product.harvestDate)) {
    throw new CommerceError(`Tanggal panen ${product.name} tidak valid.`);
  }
  return addDaysIso(product.harvestDate, DELIVERY_LEAD_DAYS);
}

async function getCommerceSettings(admin: AdminClient) {
  const { data } = await admin.from("settings").select("value").eq("key", "commerce").maybeSingle();
  return readCommerceSettings(data?.value);
}

async function createMatchedLines(admin: AdminClient, buyerId: string, items: Array<{ product_id: string; qty_kg: number; commodity_id: string | null }>): Promise<MatchedLine[]> {
  const lines: MatchedLine[] = [];
  for (const item of items) {
    const product = findProduct(item.product_id);
    const commodityId = item.commodity_id ?? await findCommodityId(admin, product);
    const qtyKg = Number(item.qty_kg);
    if (!Number.isInteger(qtyKg) || qtyKg < MIN_ORDER_KG) throw new CommerceError(`Jumlah ${product.name} tidak valid.`);

    const deliveryDate = dateForProduct(product);
    const { data: request, error: requestError } = await admin
      .from("buyer_requests")
      .insert({ buyer_id: buyerId, commodity_id: commodityId, qty_kg: qtyKg, delivery_date: deliveryDate, min_grade: product.grade, recurrence: "none", status: "OPEN" })
      .select("id")
      .single();
    if (requestError || !request) throw new CommerceError("Permintaan pembelian gagal dibuat.");

    const result = await runMatching(request.id);
    if (result.shortfallKg > 0) throw new CommerceError(`${product.name} belum memiliki stok tervalidasi ${result.shortfallKg} kg.`);
    lines.push({ product, qtyKg, commodityId, requestId: request.id, deliveryDate });
  }
  return lines;
}

async function getExistingPayment(admin: AdminClient, orderId: string) {
  const { data } = await admin.from("payment_transactions").select("snap_token, provider").eq("order_id", orderId).maybeSingle();
  return data as { snap_token: string | null; provider: "mock" | "midtrans" } | null;
}

/**
 * Checkout is idempotent on the active cart. Prices and stock are re-read from
 * verified forecasts after matching; browser/catalog totals are never trusted.
 */
export async function createCheckout(): Promise<CheckoutResult> {
  const { userId, admin } = await requireBuyer();
  const cartId = await getActiveCartId(admin, userId, false);
  if (!cartId) throw new CommerceError("Keranjang kosong.");

  const { data: items } = await admin.from("cart_items").select("product_id, commodity_id, qty_kg").eq("cart_id", cartId);
  if (!items || items.length === 0) throw new CommerceError("Keranjang kosong.");

  for (const item of items) {
    const product = findProduct(item.product_id);
    const commodityId = item.commodity_id ?? await findCommodityId(admin, product);
    const result = await previewMatch({ buyerId: userId, commodityId, qtyKg: Number(item.qty_kg), deliveryDate: dateForProduct(product), minGrade: product.grade });
    if (result.shortfallKg > 0) {
      throw new CommerceError(`${product.name} belum memiliki stok terverifikasi untuk ${result.shortfallKg} kg. Kurangi jumlah sebelum pembayaran.`);
    }
  }

  const { data: existingOrder, error: existingOrderError } = await admin
    .from("orders")
    .select("id, total_amount")
    .eq("idempotency_key", cartId)
    .maybeSingle();
  if (existingOrderError) throw new CommerceError(databaseErrorMessage(existingOrderError));

  let orderId = existingOrder?.id ?? "";
  let totalAmount = Number(existingOrder?.total_amount ?? 0);
  const hasOrderItems = existingOrder ? Boolean((await admin.from("order_items").select("id").eq("order_id", existingOrder.id).limit(1)).data?.length) : false;

  if (!existingOrder) {
    const { data: insertedOrder, error } = await admin
      .from("orders")
      .insert({ buyer_id: userId, cart_id: cartId, idempotency_key: cartId, total_amount: 0, status: "DRAFT" })
      .select("id")
      .single();
    if (error?.code === "23505") {
      const { data: raced } = await admin.from("orders").select("id, total_amount").eq("idempotency_key", cartId).single();
      if (!raced) throw new CommerceError("Gagal membuat pesanan.");
      orderId = raced.id;
      totalAmount = Number(raced.total_amount);
    } else if (error || !insertedOrder) {
      throw new CommerceError(error?.message ?? "Gagal membuat pesanan.");
    } else {
      orderId = insertedOrder.id;
    }
  }

  if (!hasOrderItems) {
    const matchedLines = await createMatchedLines(admin, userId, items);
    const settings = await getCommerceSettings(admin);
    const requestIds = matchedLines.map((line) => line.requestId);
    const { data: allocationRows, error: allocationError } = await admin
      .from("allocations")
      .select("id, request_id, forecast_id, farmer_id, committed_kg")
      .in("request_id", requestIds)
      .eq("role", "primary");
    if (allocationError || !allocationRows?.length) throw new CommerceError("Alokasi pemasok belum tersedia.");

    const allocations = allocationRows as unknown as AllocationRow[];
    const forecastIds = [...new Set(allocations.map((row) => row.forecast_id))];
    const farmerIds = [...new Set(allocations.map((row) => row.farmer_id))];
    const [{ data: forecastRows }, { data: profileRows }] = await Promise.all([
      admin.from("harvest_forecasts").select("id, price_per_kg, grade, hub_id").in("id", forecastIds),
      admin.from("profiles").select("id, display_name, org_name").in("id", farmerIds),
    ]);
    const forecasts = new Map((forecastRows as unknown as ForecastRow[] ?? []).map((row) => [row.id, row]));
    const profiles = new Map((profileRows as unknown as ProfileRow[] ?? []).map((row) => [row.id, row]));
    const orderItems: OrderItemInsert[] = [];
    const reservations: StockReservationInsert[] = [];
    const requestByCommodity = new Map(matchedLines.map((line) => [line.commodityId, line]));

    for (const allocation of allocations) {
      const forecast = forecasts.get(allocation.forecast_id);
      if (!forecast || !forecast.price_per_kg || forecast.price_per_kg <= 0) throw new CommerceError("Harga pemasok belum diverifikasi.");
      const line = requestByCommodity.get((await admin.from("buyer_requests").select("commodity_id").eq("id", allocation.request_id).single()).data?.commodity_id ?? "");
      if (!line) throw new CommerceError("Baris pesanan tidak ditemukan.");
      const finance = calcOrderLineFinance(Number(allocation.committed_kg), Number(forecast.price_per_kg), settings);
      const profile = profiles.get(allocation.farmer_id);
      orderItems.push({
        order_id: orderId,
        product_id: line.product.id,
        product_name: line.product.name,
        supplier_label: profile?.org_name ?? profile?.display_name ?? "Pemasok terverifikasi",
        grade: forecast.grade,
        unit_price: Number(forecast.price_per_kg),
        qty_kg: Number(allocation.committed_kg),
        subtotal: finance.subtotal,
        allocation_id: allocation.id,
        farmer_id: allocation.farmer_id,
        buyer_commission: finance.buyerCommission,
        farmer_commission: finance.farmerCommission,
        logistics_fee: finance.logisticsFee,
      });
      reservations.push({ order_id: orderId, product_id: line.product.id, qty_kg: Number(allocation.committed_kg), expires_at: new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString() });
      totalAmount += finance.buyerTotal;
    }

    const firstLine = matchedLines[0];
    const firstForecast = forecasts.get(allocations[0].forecast_id);
    const { error: itemError } = await admin.from("order_items").insert(orderItems);
    if (itemError) throw new CommerceError("Rincian pesanan gagal disimpan.");
    const { error: reservationError } = await admin.from("stock_reservations").insert(reservations);
    if (reservationError) throw new CommerceError("Reservasi stok gagal disimpan.");
    const { error: orderError } = await admin.from("orders").update({ total_amount: totalAmount, request_id: firstLine.requestId, hub_id: firstForecast?.hub_id ?? null }).eq("id", orderId);
    if (orderError) throw new CommerceError("Total pesanan gagal disimpan.");
    await admin.from("carts").update({ status: "checked_out" }).eq("id", cartId);
  }

  const existingPayment = await getExistingPayment(admin, orderId);
  if (existingPayment) return { orderId, snapToken: existingPayment.snap_token, provider: existingPayment.provider };

  const { data: savedOrder } = await admin.from("orders").select("total_amount").eq("id", orderId).single();
  totalAmount = Number(savedOrder?.total_amount ?? totalAmount);
  const { data: itemRows, error: itemRowsError } = await admin
    .from("order_items")
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
  try {
    assertPaymentItemsTotal(paymentItems, totalAmount);
  } catch (error) {
    throw new CommerceError(error instanceof Error ? error.message : "Rincian pembayaran tidak valid.");
  }
  const payment = await getPaymentProvider().createPayment({
    orderId,
    grossAmount: totalAmount,
    items: paymentItems,
  });
  const { error: paymentError } = await admin.from("payment_transactions").insert({
    order_id: orderId,
    midtrans_order_id: payment.reference,
    snap_token: payment.token,
    status: "UNPAID",
    provider: payment.provider,
    idempotency_key: cartId,
    raw_response: { reference: payment.reference, provider: payment.provider },
  });
  if (paymentError && paymentError.code !== "23505") throw new CommerceError("Transaksi pembayaran gagal disimpan.");
  return { orderId, snapToken: payment.token, provider: payment.provider };
}
