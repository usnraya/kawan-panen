export function releaseKg(reservedKg: number, qtyKg: number) {
  return Math.max(0, reservedKg - qtyKg);
}
