import { describe, expect, it } from "vitest";
import { assertOrderTransition, canTransitionOrder, canTransitionPayment } from "./state-machine";

describe("Kawan Panen state machines", () => {
  it("allows the normal order lifecycle", () => {
    expect(canTransitionOrder("DRAFT", "AWAITING_FARMER")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "COMPLETED")).toBe(true);
    expect(canTransitionPayment("UNPAID", "PAID_HELD")).toBe(true);
    expect(canTransitionPayment("PAID_HELD", "RELEASED")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransitionOrder("DRAFT", "PAID")).toBe(true);
    expect(canTransitionOrder("DRAFT", "COMPLETED")).toBe(false);
    expect(canTransitionPayment("RELEASED", "PAID_HELD")).toBe(false);
    expect(() => assertOrderTransition("COMPLETED", "PAID")).toThrow("Invalid order transition");
  });
});
