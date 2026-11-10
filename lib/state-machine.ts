export type OrderStatus =
  | "DRAFT"
  | "AWAITING_FARMER"
  | "CONFIRMED"
  | "PAID"
  | "AT_HUB"
  | "QC_DONE"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

export type PaymentStatus = "UNPAID" | "PAID_HELD" | "RELEASED" | "PARTIALLY_REFUNDED" | "REFUNDED";

const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["AWAITING_FARMER", "PAID", "CANCELLED"],
  AWAITING_FARMER: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PAID", "CANCELLED"],
  PAID: ["AT_HUB", "CANCELLED", "DISPUTED"],
  AT_HUB: ["QC_DONE", "DISPUTED"],
  QC_DONE: ["IN_TRANSIT", "DISPUTED"],
  IN_TRANSIT: ["DELIVERED", "DISPUTED"],
  DELIVERED: ["COMPLETED", "DISPUTED"],
  COMPLETED: [],
  DISPUTED: ["COMPLETED", "CANCELLED"],
  CANCELLED: [],
};

const PAYMENT_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  UNPAID: ["PAID_HELD"],
  PAID_HELD: ["RELEASED", "PARTIALLY_REFUNDED", "REFUNDED"],
  RELEASED: [],
  PARTIALLY_REFUNDED: ["RELEASED", "REFUNDED"],
  REFUNDED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return PAYMENT_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransitionOrder(from, to)) throw new Error(`Invalid order transition: ${from} -> ${to}`);
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus) {
  if (!canTransitionPayment(from, to)) throw new Error(`Invalid payment transition: ${from} -> ${to}`);
}
