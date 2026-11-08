import { describe, expect, it } from "vitest";
import { assertPaymentItemsTotal, buildPaymentItems, calcOrderLineFinance, calcShortfallRefund, validatePriceFloor } from "./finance";

const settings = {
  farmerCommissionBps: 300,
  buyerCommissionBps: 300,
  logisticsPerKg: 1_500,
  priceFloorMultiplier: 1.2,
};

describe("Kawan Panen finance", () => {
  it("matches the required 50kg tomato example", () => {
    expect(calcOrderLineFinance(50, 9_000, settings)).toEqual({
      subtotal: 450_000,
      buyerCommission: 13_500,
      logisticsFee: 75_000,
      buyerTotal: 538_500,
      farmerCommission: 13_500,
      farmerNet: 436_500,
      platformRevenue: 27_000,
    });
  });

  it("builds payment items matching the frozen gross amount", () => {
    const finance = calcOrderLineFinance(50, 9_000, settings);
    const items = buildPaymentItems([{
      productId: "tomat-a",
      productName: "Tomat Grade A",
      unitPrice: 9_000,
      qtyKg: 50,
      buyerCommission: finance.buyerCommission,
      logisticsFee: finance.logisticsFee,
    }]);
    expect(items.reduce((sum, item) => sum + item.price * item.quantity, 0)).toBe(finance.buyerTotal);
    expect(() => assertPaymentItemsTotal(items, finance.buyerTotal)).not.toThrow();
    expect(() => assertPaymentItemsTotal(items, finance.subtotal)).toThrow();
  });

  it("enforces production cost plus 20 percent", () => {
    expect(validatePriceFloor(6_500, 7_000, 1.2)).toEqual({ ok: false, minPrice: 7_800 });
    expect(validatePriceFloor(6_500, 7_800, 1.2)).toEqual({ ok: true, minPrice: 7_800 });
    expect(validatePriceFloor(6_500, 7_801, 1.2).ok).toBe(true);
  });

  it("refunds the exact shortfall at the frozen line price", () => {
    expect(calcShortfallRefund(40, 50, 9_000, settings)).toEqual({
      shortfallKg: 10,
      refundToBuyer: 107_700,
    });
    expect(calcShortfallRefund(50, 50, 9_000, settings)).toEqual({ shortfallKg: 0, refundToBuyer: 0 });
  });
});
