export type Grade = "A" | "B" | "C";

export interface Forecast {
  id: string;
  farmerId: string;
  commodityId: string;
  estKg: number;
  reservedKg: number;
  expectedHarvestDate: string;
  grade: Grade;
  farmerRegency: string;
  reliability: number;
}

export interface Request {
  id: string;
  commodityId: string;
  qtyKg: number;
  deliveryDate: string;
  minGrade: Grade;
  buyerRegency: string;
}

export interface MatchingSettings {
  weights: {
    reliability: number;
    proximity: number;
    gradeFit: number;
    freshness: number;
  };
  maxSharePerSupplier: number;
  backupBufferPct: number;
  minBackupCount: number;
  harvestLeadDays: number;
  freshnessWindowDays: number;
  maxDistanceKm: number;
}

export interface Allocation {
  forecastId: string;
  farmerId: string;
  kg: number;
  role: "primary" | "backup";
}

export interface MatchResult {
  status: "MATCHED" | "PARTIAL";
  allocations: Allocation[];
  shortfallKg: number;
  backupCoveragePct: number;
  notes: string[];
}

const GRADE_RANK: Record<Grade, number> = { C: 1, B: 2, A: 3 };

function toUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function daysBetween(from: string, to: string) {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

function gradeFit(grade: Grade, minimum: Grade) {
  const difference = GRADE_RANK[grade] - GRADE_RANK[minimum];
  return difference === 0 ? 1 : difference === 1 ? 0.75 : 0.5;
}

export function match(
  req: Request,
  forecasts: Forecast[],
  distanceKm: (fromRegency: string, toRegency: string) => number,
  settings: MatchingSettings,
): MatchResult {
  const deliveryDate = toUtcDate(req.deliveryDate);
  const earliestDate = new Date(deliveryDate);
  earliestDate.setUTCDate(earliestDate.getUTCDate() - settings.freshnessWindowDays);
  const latestDate = new Date(deliveryDate);
  latestDate.setUTCDate(latestDate.getUTCDate() - settings.harvestLeadDays);

  const candidates = forecasts
    .map((forecast) => ({
      forecast,
      availableKg: Math.max(0, forecast.estKg - forecast.reservedKg),
      harvestDate: toUtcDate(forecast.expectedHarvestDate),
    }))
    .filter(({ forecast, availableKg, harvestDate }) =>
      forecast.commodityId === req.commodityId &&
      GRADE_RANK[forecast.grade] >= GRADE_RANK[req.minGrade] &&
      availableKg > 0 &&
      harvestDate >= earliestDate &&
      harvestDate <= latestDate,
    )
    .map(({ forecast, availableKg }) => {
      const distance = Math.max(0, distanceKm(forecast.farmerRegency, req.buyerRegency));
      const ageDays = daysBetween(forecast.expectedHarvestDate, req.deliveryDate);
      const proximity = settings.maxDistanceKm > 0
        ? 1 - Math.min(distance / settings.maxDistanceKm, 1)
        : 0;
      const freshness = settings.freshnessWindowDays > 0
        ? 1 - Math.min(Math.max(ageDays, 0) / settings.freshnessWindowDays, 1)
        : 0;
      const score =
        settings.weights.reliability * Math.min(Math.max(forecast.reliability, 0), 1) +
        settings.weights.proximity * proximity +
        settings.weights.gradeFit * gradeFit(forecast.grade, req.minGrade) +
        settings.weights.freshness * freshness;
      return { forecast, availableKg, score };
    })
    .sort((a, b) => b.score - a.score || b.availableKg - a.availableKg || a.forecast.id.localeCompare(b.forecast.id));

  const allocations: Allocation[] = [];
  const maxKgPerSupplier = req.qtyKg * settings.maxSharePerSupplier;
  let remainingKg = req.qtyKg;
  const primaryForecastIds = new Set<string>();

  for (const candidate of candidates) {
    if (remainingKg <= 0) break;
    const alreadyUsedByFarmer = allocations
      .filter((allocation) => allocation.role === "primary" && allocation.farmerId === candidate.forecast.farmerId)
      .reduce((sum, allocation) => sum + allocation.kg, 0);
    const kg = Math.min(candidate.availableKg, maxKgPerSupplier - alreadyUsedByFarmer, remainingKg);
    if (kg <= 0) continue;
    allocations.push({ forecastId: candidate.forecast.id, farmerId: candidate.forecast.farmerId, kg, role: "primary" });
    primaryForecastIds.add(candidate.forecast.id);
    remainingKg -= kg;
  }

  const backupTargetKg = req.qtyKg * settings.backupBufferPct;
  let backupKg = 0;
  const backupFarmers = new Set<string>();
  for (const candidate of candidates) {
    if (backupKg >= backupTargetKg && backupFarmers.size >= settings.minBackupCount) break;
    if (primaryForecastIds.has(candidate.forecast.id)) continue;
    const kg = backupTargetKg > backupKg
      ? Math.min(candidate.availableKg, backupTargetKg - backupKg)
      : 0;
    if (kg <= 0) continue;
    allocations.push({ forecastId: candidate.forecast.id, farmerId: candidate.forecast.farmerId, kg, role: "backup" });
    backupKg += kg;
    backupFarmers.add(candidate.forecast.farmerId);
  }

  const notes: string[] = [];
  if (remainingKg > 0) notes.push(`Stok utama kurang ${remainingKg} kg.`);
  if (backupFarmers.size < settings.minBackupCount) notes.push(`Pemasok cadangan minimal ${settings.minBackupCount} belum tersedia.`);
  if (backupKg < backupTargetKg) notes.push(`Cadangan baru mencakup ${backupKg} kg dari target ${backupTargetKg} kg.`);

  return {
    status: remainingKg === 0 && backupFarmers.size >= settings.minBackupCount ? "MATCHED" : "PARTIAL",
    allocations,
    shortfallKg: remainingKg,
    backupCoveragePct: req.qtyKg > 0 ? backupKg / req.qtyKg : 0,
    notes,
  };
}

// ponytail: promoteBackup (spec section 7, fallback on primary DECLINED/EXPIRED/FAILED) is
// M4 territory — add it when confirm/decline wiring actually needs to re-run matching.
