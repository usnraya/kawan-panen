import { describe, expect, it } from "vitest";
import { calcOrderLineFinance } from "./finance";
import { assertBalanced, postOrderSettlement, postRefund } from "./ledger";

const settings = { farmerCommissionBps: 300, buyerCommissionBps: 300, logisticsPerKg: 1_500, priceFloorMultiplier: 1.2 };

describe("Kawan Panen ledger", () => {
  it("balances the required settlement", () => {
    const entries = postOrderSettlement([{ ...calcOrderLineFinance(50, 9_000, settings), farmerId: "farmer-1" }]);
    expect(entries).toEqual([
      { account: "escrow", debit: 538_500, credit: 0, reference: "farmer-1" },
      { account: "farmer_payable", debit: 0, credit: 436_500, reference: "farmer-1" },
      { account: "logistics_payable", debit: 0, credit: 75_000, reference: "farmer-1" },
      { account: "platform_revenue", debit: 0, credit: 27_000, reference: "farmer-1" },
    ]);
    expect(assertBalanced(entries)).toBe(true);
  });

  it("balances partial and full refunds", () => {
    expect(assertBalanced(postRefund(107_700, "order-1"))).toBe(true);
    expect(assertBalanced(postRefund(538_500, "order-1"))).toBe(true);
  });

  it("balances multi-farmer settlement", () => {
    const entries = postOrderSettlement([
      { ...calcOrderLineFinance(25, 9_000, settings), farmerId: "farmer-1" },
      { ...calcOrderLineFinance(25, 9_000, settings), farmerId: "farmer-2" },
    ]);
    expect(entries.filter((entry) => entry.account === "escrow").reduce((sum, entry) => sum + entry.debit, 0)).toBe(538_500);
    expect(assertBalanced(entries)).toBe(true);
  });
});
