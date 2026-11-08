import type { OrderLineFinance } from "./finance";

export type LedgerAccount = "escrow" | "farmer_payable" | "logistics_payable" | "platform_revenue" | "buyer_refund";

export type LedgerEntry = {
  account: LedgerAccount;
  debit: number;
  credit: number;
  reference?: string;
};

export type SettlementLine = OrderLineFinance & { farmerId?: string };

function credit(account: LedgerAccount, amount: number, reference?: string): LedgerEntry {
  return { account, debit: 0, credit: amount, ...(reference ? { reference } : {}) };
}

function debit(account: LedgerAccount, amount: number, reference?: string): LedgerEntry {
  return { account, debit: amount, credit: 0, ...(reference ? { reference } : {}) };
}

/** Posts the buyer's held payment against farmer, logistics, and platform payables. */
export function postOrderSettlement(lines: SettlementLine[]): LedgerEntry[] {
  const entries = lines.flatMap((line) => [
    debit("escrow", line.buyerTotal, line.farmerId),
    credit("farmer_payable", line.farmerNet, line.farmerId),
    credit("logistics_payable", line.logisticsFee, line.farmerId),
    credit("platform_revenue", line.platformRevenue, line.farmerId),
  ]);
  assertBalanced(entries);
  return entries;
}

/** Posts a refund out of escrow. Refunds do not silently erase the original settlement. */
export function postRefund(amount: number, reference?: string): LedgerEntry[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Refund must be a positive integer Rupiah amount.");
  const entries = [debit("buyer_refund", amount, reference), credit("escrow", amount, reference)];
  assertBalanced(entries);
  return entries;
}

/** Releases the frozen settlement balances once the buyer confirms receipt. */
export function postRelease(lines: SettlementLine[]): LedgerEntry[] {
  const entries = lines.flatMap((line) => [
    credit("escrow", line.buyerTotal, line.farmerId),
    debit("farmer_payable", line.farmerNet, line.farmerId),
    debit("logistics_payable", line.logisticsFee, line.farmerId),
    debit("platform_revenue", line.platformRevenue, line.farmerId),
  ]);
  assertBalanced(entries);
  return entries;
}

export function assertBalanced(entries: LedgerEntry[]) {
  const debitTotal = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const creditTotal = entries.reduce((sum, entry) => sum + entry.credit, 0);
  if (debitTotal !== creditTotal) throw new Error(`Unbalanced ledger: debit ${debitTotal}, credit ${creditTotal}`);
  return true;
}
