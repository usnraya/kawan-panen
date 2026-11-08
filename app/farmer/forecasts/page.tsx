import Link from "next/link";
import { Sprout } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DEMO_FORECASTS, type DemoForecastRow } from "@/lib/demo-data";
import { CloseForecastButton } from "./close-forecast-button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const instant = false;

const gradeLabel = { A: "Grade A", B: "Grade B", C: "Grade C" } as const;

export default async function FarmerForecastsPage() {
  const profile = await getProfileForRole("farmer");

  let forecasts: DemoForecastRow[] = DEMO_FORECASTS;
  let isDemo = true;
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("harvest_forecasts")
      .select("id, est_kg, reserved_kg, expected_harvest_date, grade, status, commodities(name)")
      .eq("farmer_id", profile.id)
      .order("expected_harvest_date");
    if (data) {
      forecasts = data as unknown as DemoForecastRow[];
      isDemo = false;
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            <Sprout className="size-4" /> Petani
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-emerald-950">Prakiraan panen</h1>
          <p className="mt-2 text-zinc-600">Halo, {profile.display_name}. Kelola hasil panen yang siap ditawarkan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/farmer/allocations" className={cn(buttonVariants({ variant: "outline" }), "h-11 border-emerald-800 px-5 font-semibold text-emerald-800 hover:bg-emerald-50")}>
            Lihat alokasi
          </Link>
          <Link href="/farmer/forecasts/new" className={cn(buttonVariants(), "h-11 bg-emerald-800 px-5 font-semibold hover:bg-emerald-900")}>
            Tambah prakiraan
          </Link>
        </div>
      </div>

      {isDemo && (
        <p className="mt-6 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Menampilkan data contoh. Hubungkan Supabase untuk data petani sesungguhnya.
        </p>
      )}

      {forecasts.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Total estimasi</p><p className="mt-1.5 text-2xl font-extrabold text-emerald-950">{forecasts.reduce((sum, f) => sum + f.est_kg, 0).toLocaleString("id-ID")} kg</p></div>
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Sudah terpakai</p><p className="mt-1.5 text-2xl font-extrabold text-emerald-950">{forecasts.reduce((sum, f) => sum + f.reserved_kg, 0).toLocaleString("id-ID")} kg</p></div>
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Masih tersedia</p><p className="mt-1.5 text-2xl font-extrabold text-emerald-700">{forecasts.reduce((sum, f) => sum + (f.est_kg - f.reserved_kg), 0).toLocaleString("id-ID")} kg</p></div>
        </div>
      )}

      {forecasts.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">
          Belum ada prakiraan panen. Tambahkan data pertama.
        </div>
      )}

      {forecasts.length > 0 && (
        <div className="mt-8 overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-emerald-50 text-emerald-900">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Komoditas</th>
                <th className="px-5 py-3.5 font-semibold">Tanggal panen</th>
                <th className="px-5 py-3.5 font-semibold">Grade</th>
                <th className="px-5 py-3.5 font-semibold">Estimasi kg</th>
                <th className="px-5 py-3.5 font-semibold">Terpakai kg</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {forecasts.map((f) => (
                <tr key={f.id} className="border-t border-emerald-950/5 hover:bg-emerald-50/40">
                  <td className="px-5 py-3.5 font-semibold text-emerald-950">{f.commodities?.name ?? "—"}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{f.expected_harvest_date}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{gradeLabel[f.grade]}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{f.est_kg.toLocaleString("id-ID")}</td>
                  <td className="px-5 py-3.5 text-zinc-700">{f.reserved_kg.toLocaleString("id-ID")}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant={f.status === "open" ? "default" : "secondary"} className={f.status === "open" ? "bg-emerald-700" : ""}>
                      {f.status === "open" ? "Terbuka" : "Ditutup"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    {!isDemo && f.status === "open" && f.reserved_kg === 0 && (
                      <CloseForecastButton forecastId={f.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </main>
      <SiteFooter />
    </div>
  );
}
