"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Grade, RequestRecurrence } from "@/lib/database.types";
import { match, type Forecast, type MatchingSettings } from "@/lib/matching";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";

export type RequestActionState = { error?: string } | null;

const grades = new Set<Grade>(["A", "B", "C"]);
const recurrences = new Set<RequestRecurrence>(["none", "weekly"]);
const DEFAULT_SETTINGS: MatchingSettings = {
  weights: { reliability: 0.4, proximity: 0.25, gradeFit: 0.2, freshness: 0.15 },
  maxSharePerSupplier: 0.5,
  backupBufferPct: 0.3,
  minBackupCount: 1,
  harvestLeadDays: 1,
  freshnessWindowDays: 7,
  maxDistanceKm: 100,
};

type MatchingRow = {
  id: string;
  farmer_id: string;
  commodity_id: string;
  est_kg: number;
  reserved_kg: number;
  expected_harvest_date: string;
  grade: Grade;
  profiles: { regency: string } | null;
};

function isValidDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readSettings(value: Record<string, unknown> | null): MatchingSettings {
  const weights = value?.weights;
  return {
    ...DEFAULT_SETTINGS,
    ...(value && typeof value === "object" ? value : {}),
    weights: {
      ...DEFAULT_SETTINGS.weights,
      ...(weights && typeof weights === "object" ? weights : {}),
    },
    maxSharePerSupplier: readNumber(value?.maxSharePerSupplier, DEFAULT_SETTINGS.maxSharePerSupplier),
    backupBufferPct: readNumber(value?.backupBufferPct, DEFAULT_SETTINGS.backupBufferPct),
    minBackupCount: readNumber(value?.minBackupCount, DEFAULT_SETTINGS.minBackupCount),
    harvestLeadDays: readNumber(value?.harvestLeadDays, DEFAULT_SETTINGS.harvestLeadDays),
    freshnessWindowDays: readNumber(value?.freshnessWindowDays, DEFAULT_SETTINGS.freshnessWindowDays),
    maxDistanceKm: readNumber(value?.maxDistanceKm, DEFAULT_SETTINGS.maxDistanceKm),
  };
}

export async function createBuyerRequest(
  _previousState: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const commodityId = String(formData.get("commodityId") ?? "");
  const qtyKg = Number(formData.get("qtyKg"));
  const deliveryDate = String(formData.get("deliveryDate") ?? "");
  const minGrade = String(formData.get("minGrade") ?? "") as Grade;
  const recurrence = String(formData.get("recurrence") ?? "none") as RequestRecurrence;

  if (!commodityId || !Number.isFinite(qtyKg) || qtyKg <= 0) return { error: "Komoditas dan jumlah kg wajib diisi dengan benar." };
  if (!isValidDate(deliveryDate)) return { error: "Tanggal kirim tidak valid." };
  if (!grades.has(minGrade)) return { error: "Grade minimum tidak valid." };
  if (!recurrences.has(recurrence)) return { error: "Pilihan pengulangan tidak valid." };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Sesi login tidak ditemukan. Masuk sebagai buyer terlebih dahulu." };

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if (profile?.role !== "buyer") return { error: "Hanya buyer yang boleh membuat permintaan." };

    const { data: request, error } = await supabase
      .from("buyer_requests")
      .insert({ buyer_id: user.id, commodity_id: commodityId, qty_kg: qtyKg, delivery_date: deliveryDate, min_grade: minGrade, recurrence, status: "OPEN" })
      .select("id")
      .single();
    if (error || !request) return { error: error?.message ?? "Permintaan gagal disimpan." };

    if (hasSupabaseAdminEnv()) await runMatching(request.id);
    revalidatePath("/buyer/requests");
    redirect(`/buyer/requests/${request.id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    return { error: "Permintaan belum dapat diproses. Coba lagi." };
  }
}

type MatchCoreParams = { id: string; commodityId: string; qtyKg: number; deliveryDate: string; minGrade: Grade; buyerRegency: string };

/**
 * Shared, side-effect-free matching core: loads live verified forecasts and
 * settings, then runs the pure `match()` function. Used by `runMatching()`
 * (which persists allocations) and `previewMatch()` (read-only, for showing
 * buyers real matchability before checkout).
 */
async function runMatchCore(admin: ReturnType<typeof createAdminClient>, params: MatchCoreParams) {
  const [{ data: forecastRows }, { data: scoreRows }, { data: distanceRows }, { data: settingRow }] = await Promise.all([
    admin.from("harvest_forecasts").select("id, farmer_id, commodity_id, est_kg, reserved_kg, expected_harvest_date, grade, profiles!inner(regency)").eq("commodity_id", params.commodityId).eq("status", "open").eq("verification_status", "verified"),
    admin.from("supplier_scores").select("farmer_id, score"),
    admin.from("zone_distance").select("from_regency, to_regency, km"),
    admin.from("settings").select("value").eq("key", "matching").maybeSingle(),
  ]);

  const scores = new Map((scoreRows ?? []).map((row) => [row.farmer_id, Number(row.score)]));
  const rows = (forecastRows ?? []) as unknown as MatchingRow[];
  const forecasts: Forecast[] = rows.map((row) => ({
    id: row.id,
    farmerId: row.farmer_id,
    commodityId: row.commodity_id,
    estKg: Number(row.est_kg),
    reservedKg: Number(row.reserved_kg),
    expectedHarvestDate: row.expected_harvest_date,
    grade: row.grade,
    farmerRegency: row.profiles?.regency ?? "",
    reliability: scores.get(row.farmer_id) ?? 0.5,
  }));
  const distances = new Map((distanceRows ?? []).map((row) => [`${row.from_regency}:${row.to_regency}`, Number(row.km)]));
  const settings = readSettings((settingRow?.value ?? null) as Record<string, unknown> | null);
  const result = match(
    { id: params.id, commodityId: params.commodityId, qtyKg: params.qtyKg, deliveryDate: params.deliveryDate, minGrade: params.minGrade, buyerRegency: params.buyerRegency },
    forecasts,
    (from, to) => distances.get(`${from}:${to}`) ?? (from === to ? 0 : settings.maxDistanceKm),
    settings,
  );
  return { result, forecasts };
}

/**
 * Read-only matchability check for a (not-yet-created) buyer request. No
 * database writes: used to show buyers real stock/allocation limits before
 * they add to cart or pay, without creating buyer_requests/allocations rows.
 */
export async function previewMatch(params: { buyerId: string; commodityId: string; qtyKg: number; deliveryDate: string; minGrade: Grade }) {
  const admin = createAdminClient();
  const { data: buyer } = await admin.from("profiles").select("regency").eq("id", params.buyerId).single();
  const { result } = await runMatchCore(admin, { id: "preview", ...params, buyerRegency: buyer?.regency ?? "Badung" });
  return result;
}

export async function runMatching(requestId: string) {
  const admin = createAdminClient();
  const { data: request, error: requestError } = await admin
    .from("buyer_requests")
    .select("id, buyer_id, commodity_id, qty_kg, delivery_date, min_grade")
    .eq("id", requestId)
    .single();
  if (requestError || !request) throw new Error("Permintaan tidak ditemukan.");

  const { data: buyer } = await admin.from("profiles").select("regency").eq("id", request.buyer_id).single();
  const { result } = await runMatchCore(admin, {
    id: request.id,
    commodityId: request.commodity_id,
    qtyKg: Number(request.qty_kg),
    deliveryDate: request.delivery_date,
    minGrade: request.min_grade,
    buyerRegency: buyer?.regency ?? "Badung",
  });

  const deadline = new Date(`${request.delivery_date}T00:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() - 3);
  const allocations = result.allocations.map((allocation) => ({
    forecast_id: allocation.forecastId,
    farmer_id: allocation.farmerId,
    role: allocation.role,
    committed_kg: allocation.kg,
    confirm_deadline: deadline.toISOString(),
  }));

  const { error: commitError } = await admin.rpc("commit_match_allocations", {
    p_request_id: request.id,
    p_allocations: allocations,
    p_status: result.status,
    p_shortfall_kg: result.shortfallKg,
  });
  if (commitError) throw new Error(commitError.message);
  revalidatePath(`/buyer/requests/${request.id}`);
  revalidatePath("/buyer/requests");
  return result;
}
