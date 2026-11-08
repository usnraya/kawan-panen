"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Grade } from "@/lib/database.types";
import { validatePriceFloor } from "@/lib/finance";
import { createClient } from "@/lib/supabase/server";

type ActionState = { error?: string } | null;

const grades = new Set<Grade>(["A", "B", "C"]);

export async function createForecast(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const commodityId = String(formData.get("commodityId") ?? "");
  const estKg = Number(formData.get("estKg"));
  const expectedHarvestDate = String(formData.get("expectedHarvestDate") ?? "");
  const grade = String(formData.get("grade") ?? "") as Grade;
  const productionCostPerKg = Number(formData.get("productionCostPerKg"));
  const pricePerKg = Number(formData.get("pricePerKg"));

  if (!commodityId || !Number.isFinite(estKg) || estKg <= 0) {
    return { error: "Komoditas dan estimasi kg wajib diisi dengan benar." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expectedHarvestDate)) {
    return { error: "Tanggal panen tidak valid." };
  }
  if (!grades.has(grade)) {
    return { error: "Grade panen tidak valid." };
  }
  if (!Number.isFinite(productionCostPerKg) || productionCostPerKg <= 0 || !Number.isFinite(pricePerKg) || pricePerKg <= 0) {
    return { error: "Modal produksi dan harga jual per kg wajib diisi." };
  }

  let supabase;
  try {
    supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Sesi login tidak ditemukan." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "farmer") {
      return { error: "Hanya petani yang boleh menambah prakiraan panen." };
    }

    const { data: commodity } = await supabase
      .from("commodities")
      .select("id")
      .eq("id", commodityId)
      .single();
    if (!commodity) return { error: "Komoditas tidak ditemukan." };

    const { data: commerceRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "commerce")
      .maybeSingle();
    const commerce = commerceRow?.value;
    const priceFloorMultiplier =
      commerce && typeof commerce === "object" && "priceFloorMultiplier" in commerce &&
      typeof commerce.priceFloorMultiplier === "number" && Number.isFinite(commerce.priceFloorMultiplier)
        ? commerce.priceFloorMultiplier
        : 1.2;
    const priceCheck = validatePriceFloor(productionCostPerKg, pricePerKg, priceFloorMultiplier);
    if (!priceCheck.ok) {
      return { error: `Harga jual terlalu rendah. Minimum Rp${priceCheck.minPrice.toLocaleString("id-ID")}/kg (modal × ${priceFloorMultiplier.toLocaleString("id-ID")}).` };
    }

    const { error } = await supabase.from("harvest_forecasts").insert({
      farmer_id: user.id,
      commodity_id: commodity.id,
      est_kg: estKg,
      expected_harvest_date: expectedHarvestDate,
      grade,
      production_cost_per_kg: productionCostPerKg,
      price_per_kg: pricePerKg,
    });
    if (error) return { error: "Prakiraan gagal disimpan. Coba lagi." };
  } catch {
    return {
      error: "Supabase belum dikonfigurasi. Isi .env.local lalu jalankan schema.sql.",
    };
  }

  revalidatePath("/farmer/forecasts");
  revalidatePath("/buyer/availability");
  redirect("/farmer/forecasts");
}

export async function closeForecast(forecastId: string) {
  if (!forecastId) return;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("harvest_forecasts")
      .update({ status: "closed" })
      .eq("id", forecastId)
      .eq("farmer_id", user.id)
      .eq("reserved_kg", 0);
    revalidatePath("/farmer/forecasts");
    revalidatePath("/buyer/availability");
  } catch {
    // The UI remains usable when Supabase is not configured.
  }
}
