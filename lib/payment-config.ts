export type PaymentProviderKind = "mock" | "midtrans";

export function resolvePaymentProvider(env: NodeJS.ProcessEnv = process.env): PaymentProviderKind {
  const provider = env.PAYMENT_PROVIDER;
  if (provider === "mock") return "mock";
  if (provider !== "midtrans") {
    throw new Error("PAYMENT_PROVIDER harus diatur ke midtrans atau mock.");
  }
  if (!env.MIDTRANS_SERVER_KEY) {
    throw new Error("MIDTRANS_SERVER_KEY wajib diatur untuk payment provider Midtrans.");
  }
  return "midtrans";
}
