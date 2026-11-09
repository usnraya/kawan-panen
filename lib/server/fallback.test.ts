import { describe, expect, it } from "vitest";
import { releaseKg } from "./reservation";

describe("releaseKg", () => {
  it("subtracts the released amount from reserved stock", () => {
    expect(releaseKg(100, 40)).toBe(60);
  });

  it("never goes below zero when releasing more than reserved", () => {
    expect(releaseKg(20, 40)).toBe(0);
  });

  it("is a no-op when releasing zero", () => {
    expect(releaseKg(50, 0)).toBe(50);
  });
});
