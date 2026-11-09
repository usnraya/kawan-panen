import { describe, expect, it } from "vitest";
import { CATALOG_PRODUCTS, formatHarvestDate, isCatalogDate } from "./catalog-data";

describe("catalog dates", () => {
  it("keeps every seeded date deterministic and ISO-formatted", () => {
    expect(CATALOG_PRODUCTS.every((product) => isCatalogDate(product.harvestDate))).toBe(true);
    expect(formatHarvestDate("2026-11-12")).toMatch(/12.*Nov.*2026/);
  });

  it("rejects invalid calendar dates", () => {
    expect(isCatalogDate("2026-02-30")).toBe(false);
    expect(() => formatHarvestDate("12 Nov 2026")).toThrow("Invalid catalog date");
  });
});
