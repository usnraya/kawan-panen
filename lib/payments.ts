import "server-only";

import { createSnapTransaction } from "./midtrans";

export type PaymentOrder = {
  orderId: string;
  grossAmount: number;
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
};

export type PaymentResult = {
  provider: "mock" | "midtrans";
  reference: string;
  token: string | null;
};

export interface PaymentProvider {
  createPayment(order: PaymentOrder): Promise<PaymentResult>;
}

class MockProvider implements PaymentProvider {
  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    return { provider: "mock", reference: `MOCK-${order.orderId}`, token: null };
  }
}

class MidtransSandboxProvider implements PaymentProvider {
  async createPayment(order: PaymentOrder): Promise<PaymentResult> {
    const snap = await createSnapTransaction(order);
    return { provider: "midtrans", reference: order.orderId, token: snap.token ?? null };
  }
}

export function getPaymentProvider(): PaymentProvider {
  return process.env.MIDTRANS_SERVER_KEY ? new MidtransSandboxProvider() : new MockProvider();
}
