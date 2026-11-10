import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { resolvePaymentProvider } from "./payment-config";
import { verifyMidtransSignature } from "./midtrans";

const originalEnv = { ...process.env };

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolvePaymentProvider", () => {
  it("requires explicit mock selection", () => {
    expect(resolvePaymentProvider(env({ PAYMENT_PROVIDER: "mock" }))).toBe("mock");
    expect(() => resolvePaymentProvider(env({ PAYMENT_PROVIDER: undefined }))).toThrow("PAYMENT_PROVIDER");
  });

  it("requires the Midtrans server key", () => {
    expect(() => resolvePaymentProvider(env({ PAYMENT_PROVIDER: "midtrans", MIDTRANS_SERVER_KEY: undefined }))).toThrow(
      "MIDTRANS_SERVER_KEY",
    );
    expect(
      resolvePaymentProvider(env({ PAYMENT_PROVIDER: "midtrans", MIDTRANS_SERVER_KEY: "SB-Mid-server-test" })),
    ).toBe("midtrans");
  });

  it("rejects unknown providers", () => {
    expect(() => resolvePaymentProvider(env({ PAYMENT_PROVIDER: "stripe" }))).toThrow("PAYMENT_PROVIDER");
  });
});

describe("verifyMidtransSignature", () => {
  const orderId = "ORDER-TEST";
  const statusCode = "200";
  const grossAmount = "150000";
  const serverKey = "SB-Mid-server-test";

  function sign(key: string) {
    return createHash("sha512").update(`${orderId}${statusCode}${grossAmount}${key}`).digest("hex");
  }

  it("accepts a correctly computed signature", () => {
    process.env.MIDTRANS_SERVER_KEY = serverKey;
    expect(verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey: sign(serverKey) })).toBe(true);
  });

  it("rejects a forged signature using the wrong key", () => {
    process.env.MIDTRANS_SERVER_KEY = serverKey;
    expect(verifyMidtransSignature({ orderId, statusCode, grossAmount, signatureKey: sign("wrong-key") })).toBe(false);
  });

  it("rejects a tampered amount", () => {
    process.env.MIDTRANS_SERVER_KEY = serverKey;
    const signatureKey = sign(serverKey);
    expect(verifyMidtransSignature({ orderId, statusCode, grossAmount: "999999", signatureKey })).toBe(false);
  });
});
