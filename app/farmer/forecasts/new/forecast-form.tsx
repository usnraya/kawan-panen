"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Database } from "@/lib/database.types";
import { createForecast } from "../actions";

type Commodity = Database["public"]["Tables"]["commodities"]["Row"];

export function ForecastForm({ commodities }: { commodities: Commodity[] }) {
  const [state, formAction, pending] = useActionState(createForecast, null);

  return (
    <form
      action={formAction}
      className="flex max-w-xl flex-col gap-5 rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm"
    >
      <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900">
        Isi perkiraan dengan jumlah yang paling mendekati kondisi panen. Data ini membantu pembeli menyiapkan kebutuhan lebih awal.
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="commodityId">Komoditas</Label>
        <select
          id="commodityId"
          name="commodityId"
          required
          defaultValue=""
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="" disabled>Pilih komoditas</option>
          {commodities.map((commodity) => (
            <option key={commodity.id} value={commodity.id}>{commodity.name}</option>
          ))}
        </select>
        {commodities.length === 0 && (
          <p className="text-xs text-amber-700">Belum ada komoditas. Jalankan supabase/seed.sql.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="estKg">Estimasi panen (kg)</Label>
        <Input id="estKg" name="estKg" type="number" min="0.1" step="0.1" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expectedHarvestDate">Tanggal perkiraan panen</Label>
        <Input id="expectedHarvestDate" name="expectedHarvestDate" type="date" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="productionCostPerKg">Modal produksi (Rp/kg)</Label>
        <Input id="productionCostPerKg" name="productionCostPerKg" type="number" min="1" step="1" required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pricePerKg">Harga jual yang diminta (Rp/kg)</Label>
        <Input id="pricePerKg" name="pricePerKg" type="number" min="1" step="1" required />
        <p className="text-xs text-zinc-500">Sesuai Pergub Bali 99/2018, harga jual minimum adalah modal produksi × 1,2.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="grade">Grade</Label>
        <select
          id="grade"
          name="grade"
          defaultValue="B"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="A">A — kualitas tertinggi</option>
          <option value="B">B — kualitas standar</option>
          <option value="C">C — kualitas olahan</option>
        </select>
      </div>

      {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <Button type="submit" disabled={pending || commodities.length === 0} className="h-11 bg-emerald-800 font-semibold hover:bg-emerald-900">
        {pending ? "Menyimpan…" : "Simpan prakiraan"}
      </Button>
    </form>
  );
}
