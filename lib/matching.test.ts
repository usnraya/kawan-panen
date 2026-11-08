import { describe, expect, it } from "vitest";
import { match, type Forecast, type MatchingSettings, type Request } from "./matching";

const settings: MatchingSettings = {
  weights: { reliability: 0.4, proximity: 0.25, gradeFit: 0.2, freshness: 0.15 },
  maxSharePerSupplier: 0.5,
  backupBufferPct: 0.3,
  minBackupCount: 1,
  harvestLeadDays: 1,
  freshnessWindowDays: 7,
  maxDistanceKm: 100,
};

const request: Request = {
  id: "request-1",
  commodityId: "tomato",
  qtyKg: 300,
  deliveryDate: "2026-11-15",
  minGrade: "B",
  buyerRegency: "Badung",
};

function forecast(overrides: Partial<Forecast>): Forecast {
  return {
    id: "forecast-default",
    farmerId: "farmer-default",
    commodityId: "tomato",
    estKg: 100,
    reservedKg: 0,
    expectedHarvestDate: "2026-11-12",
    grade: "A",
    farmerRegency: "Bangli",
    reliability: 0.5,
    ...overrides,
  };
}

const distance = () => 40;

describe("match", () => {
  it("matches the 300 kg tomato hero scenario with a primary and backup", () => {
    const result = match(request, [
      forecast({ id: "f1", farmerId: "farmer-1", estKg: 140 }),
      forecast({ id: "f2", farmerId: "farmer-2", estKg: 110 }),
      forecast({ id: "f3", farmerId: "farmer-3", estKg: 90, grade: "B" }),
      forecast({ id: "f4", farmerId: "farmer-4", estKg: 70, farmerRegency: "Tabanan" }),
    ], distance, settings);

    expect(result.status).toBe("MATCHED");
    expect(result.shortfallKg).toBe(0);
    expect(result.allocations.filter((item) => item.role === "primary").reduce((sum, item) => sum + item.kg, 0)).toBe(300);
    expect(result.allocations.some((item) => item.role === "backup")).toBe(true);
  });

  it("returns PARTIAL when eligible stock is short", () => {
    const result = match(request, [forecast({ id: "f1", farmerId: "farmer-1", estKg: 100 })], distance, settings);
    expect(result.status).toBe("PARTIAL");
    expect(result.shortfallKg).toBe(200);
  });

  it("limits each supplier to maxSharePerSupplier", () => {
    const result = match(request, [
      forecast({ id: "f1", farmerId: "farmer-1", estKg: 300 }),
      forecast({ id: "f2", farmerId: "farmer-2", estKg: 150 }),
      forecast({ id: "f3", farmerId: "farmer-3", estKg: 150 }),
    ], distance, { ...settings, backupBufferPct: 0, minBackupCount: 0 });

    expect(result.allocations.filter((item) => item.role === "primary").every((item) => item.kg <= 150)).toBe(true);
  });

  it("filters grade and harvest date before allocating", () => {
    const result = match(request, [
      forecast({ id: "wrong-grade", grade: "C", estKg: 300 }),
      forecast({ id: "too-early", expectedHarvestDate: "2026-11-01", estKg: 300 }),
      forecast({ id: "eligible", farmerId: "farmer-2", estKg: 150 }),
    ], distance, { ...settings, backupBufferPct: 0, minBackupCount: 0 });

    expect(result.allocations.map((item) => item.forecastId)).toEqual(["eligible"]);
  });
});
