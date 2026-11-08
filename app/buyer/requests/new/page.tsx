import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { DEMO_COMMODITIES } from "@/lib/demo-data";
import { CATALOG_PRODUCTS } from "@/lib/catalog-data";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RequestForm } from "../request-form";

export const instant = false;

type NewRequestPageProps = { searchParams: Promise<{ commodity?: string }> };

export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  await getProfileForRole("buyer");
  const { commodity: requestedCommodity } = await searchParams;
  const commodities = hasSupabaseEnv()
    ? (await (await createClient()).from("commodities").select("id, name, shelf_life_days").order("name")).data ?? []
    : DEMO_COMMODITIES;
  const selected = commodities.find((commodity) => commodity.id === requestedCommodity) ?? commodities[0];
  const catalogStock = CATALOG_PRODUCTS.find((product) => product.commodityName === selected?.name)?.availableKg ?? 300;

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/buyer/availability" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft className="size-4" /> Kembali ke katalog</Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><ClipboardList className="size-4" /> Permintaan kebutuhan</p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-emerald-950 sm:text-4xl">Ajukan pasokan untuk dapurmu.</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-600">Isi jumlah, tanggal kirim, dan standar mutu. Sistem akan mencocokkan kebutuhan dengan prakiraan panen yang sesuai.</p>
            <div className="mt-6 rounded-2xl border border-emerald-950/10 bg-white p-5 text-sm text-zinc-600 shadow-sm">
              <p className="font-bold text-emerald-950">Yang terjadi setelah diajukan</p>
              <ol className="mt-3 space-y-3">
                <li><span className="mr-2 font-bold text-emerald-700">01</span> Pasokan disaring berdasarkan grade dan tanggal panen.</li>
                <li><span className="mr-2 font-bold text-emerald-700">02</span> Pemasok utama dan cadangan disiapkan.</li>
                <li><span className="mr-2 font-bold text-emerald-700">03</span> Status permintaan bisa dipantau dari halaman pesanan.</li>
              </ol>
            </div>
          </div>
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-extrabold text-emerald-950">Detail kebutuhan</h2>
            {selected ? <RequestForm commodityId={selected.id} commodityName={selected.name} minGrade="B" availableKg={catalogStock} /> : <p className="mt-5 text-sm text-red-600">Komoditas belum tersedia.</p>}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
