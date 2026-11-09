import { describe, expect, it } from "vitest";
import { addDaysIso, CATALOG_PRODUCTS, DELIVERY_LEAD_DAYS, formatHarvestDate, isCatalogDate } from "./catalog-data";

describe("catalog dates", () => {
  it("keeps every seeded date deterministic and ISO-formatted", () => {
    expect(CATALOG_PRODUCTS.every((product) => isCatalogDate(product.harvestDate))).toBe(true);
    expect(formatHarvestDate("2026-11-12")).toMatch(/12.*Nov.*2026/);
  });

  it("rejects invalid calendar dates", () => {
    expect(isCatalogDate("2026-02-30")).toBe(false);
    expect(() => formatHarvestDate("12 Nov 2026")).toThrow("Invalid catalog date");
  });

  it("adds days deterministically, including month rollover", () => {
    expect(addDaysIso("2026-11-14", DELIVERY_LEAD_DAYS)).toBe("2026-11-15");
    expect(addDaysIso("2026-11-29", 2)).toBe("2026-12-01");
  });
});
