// Pure money math for the Kawan Panen commerce layer. No I/O, no Supabase —
// callers (lib/commerce.ts, server actions) read lib/settings "commerce" row
// and pass it in. All amounts are integer Rupiah; round once, here, on write.

export interface CommerceSettings {
  farmerCommissionBps: number;
  buyerCommissionBps: number;
  logisticsPerKg: number;
  priceFloorMultiplier: number;
}

export interface OrderLineFinance {
  subtotal: number;
  buyerCommission: number;
  logisticsFee: number;
  buyerTotal: number;
  farmerCommission: number;
  farmerNet: number;
  platformRevenue: number;
}

export type PaymentItem = { id: string; name: string; price: number; quantity: number };

export type PaymentOrderLine = {
  productId: string;
  productName: string;
  unitPrice: number;
  qtyKg: number;
  buyerCommission: number;
  logisticsFee: number;
};

/** Builds provider items whose integer total exactly equals the frozen order total. */
export function buildPaymentItems(lines: PaymentOrderLine[]): PaymentItem[] {
  const items = lines.flatMap((line) => {
    const product = { id: line.productId, name: line.productName, price: line.unitPrice, quantity: line.qtyKg };
    const fees: PaymentItem[] = [];
    if (line.buyerCommission > 0) fees.push({ id: `${line.productId}-buyer-fee`, name: "Komisi layanan pembeli", price: line.buyerCommission, quantity: 1 });
    if (line.logisticsFee > 0) fees.push({ id: `${line.productId}-logistics`, name: "Ongkos logistik", price: line.logisticsFee, quantity: 1 });
    return [product, ...fees];
  });
  return items;
}

export function paymentItemsTotal(items: PaymentItem[]) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function assertPaymentItemsTotal(items: PaymentItem[], grossAmount: number) {
  if (paymentItemsTotal(items) !== grossAmount) {
    throw new Error("Rincian pembayaran tidak sama dengan total pesanan.");
  }
}

function bps(amount: number, basisPoints: number) {
  return Math.round((amount * basisPoints) / 10_000);
}

/** Minimum allowed selling price for a given production cost, per the Pergub 99/2018 floor rule. */
export function minPricePerKg(productionCostPerKg: number, multiplier: number) {
  return Math.ceil(productionCostPerKg * multiplier);
}

export function validatePriceFloor(productionCostPerKg: number, askingPricePerKg: number, multiplier: number) {
  const minPrice = minPricePerKg(productionCostPerKg, multiplier);
  return { ok: askingPricePerKg >= minPrice, minPrice };
}

/** Buyer total = subtotal + buyer commission + pass-through logistics. Farmer gets subtotal - farmer commission. */
export function calcOrderLineFinance(qtyKg: number, unitPrice: number, settings: CommerceSettings): OrderLineFinance {
  const subtotal = Math.round(qtyKg * unitPrice);
  const buyerCommission = bps(subtotal, settings.buyerCommissionBps);
  const logisticsFee = Math.round(qtyKg * settings.logisticsPerKg);
  const farmerCommission = bps(subtotal, settings.farmerCommissionBps);
  return {
    subtotal,
    buyerCommission,
    logisticsFee,
    buyerTotal: subtotal + buyerCommission + logisticsFee,
    farmerCommission,
    farmerNet: subtotal - farmerCommission,
    platformRevenue: buyerCommission + farmerCommission,
  };
}

/**
 * QC at the hub weighs in less than committed_kg: re-price the line at the actual
 * weight and report the buyer refund owed for the shortfall. Logistics is refunded
 * too since it was never delivered; the farmer was never paid for kg not delivered.
 */
export function calcShortfallRefund(actualKg: number, committedKg: number, unitPrice: number, settings: CommerceSettings) {
  if (actualKg >= committedKg) return { shortfallKg: 0, refundToBuyer: 0 };
  const original = calcOrderLineFinance(committedKg, unitPrice, settings);
  const actual = calcOrderLineFinance(actualKg, unitPrice, settings);
  return { shortfallKg: committedKg - actualKg, refundToBuyer: original.buyerTotal - actual.buyerTotal };
}
