import Link from "next/link";
import { getProfileForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { DEMO_COMMODITIES } from "@/lib/demo-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ForecastForm } from "./forecast-form";

export const instant = false;

export default async function NewForecastPage() {
  await getProfileForRole("farmer");
  const commodities = hasSupabaseEnv()
    ? (await (await createClient()).from("commodities").select("id, name, shelf_life_days").order("name")).data ?? []
    : DEMO_COMMODITIES;

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/farmer/forecasts" className="text-sm font-semibold text-emerald-800 hover:underline">
          ← Kembali ke prakiraan
        </Link>
        <h1 className="mt-5 text-3xl font-extrabold text-emerald-950">Tambah prakiraan panen</h1>
        <p className="mt-2 text-zinc-600">Masukkan estimasi hasil panen yang siap kamu tawarkan.</p>
        <div className="mt-8">
          <ForecastForm commodities={commodities} />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
