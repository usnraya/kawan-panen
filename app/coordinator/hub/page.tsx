import Link from "next/link";
import { ClipboardCheck, PackageSearch, ShieldCheck } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { VerifyButtons } from "./verify-buttons";
import { QcForm } from "./qc-form";
import { FulfillmentActions } from "./fulfillment-actions";

export const instant = false;

type PendingForecast = {
  id: string;
  est_kg: number;
  price_per_kg: number | null;
  production_cost_per_kg: number | null;
  grade: string;
  profiles: { display_name: string; regency: string } | null;
  commodities: { name: string } | null;
};

type QcAllocation = {
  id: string;
  committed_kg: number;
  role: string;
  profiles: { display_name: string } | null;
  buyer_requests: { commodities: { name: string } | null } | null;
};

type FulfillmentOrder = {
  id: string;
  status: string;
  total_amount: number;
  profiles: { display_name: string } | null;
};

const FULFILLMENT_STATUSES = ["PAID", "AT_HUB", "QC_DONE", "IN_TRANSIT"] as const;

export default async function CoordinatorHubPage() {
  await getProfileForRole("coordinator");

  let pending: PendingForecast[] = [];
  let needsQc: QcAllocation[] = [];
  let fulfillmentOrders: FulfillmentOrder[] = [];
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const [{ data: pendingRows }, { data: qcRows }, { data: orderRows }] = await Promise.all([
      supabase
        .from("harvest_forecasts")
        .select("id, est_kg, price_per_kg, production_cost_per_kg, grade, profiles(display_name, regency), commodities(name)")
        .eq("verification_status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("allocations")
        .select("id, committed_kg, role, profiles(display_name), buyer_requests(commodities(name))")
        .eq("status", "CONFIRMED")
        .is("actual_kg", null)
        .order("confirmed_at"),
      supabase
        .from("orders")
        .select("id, status, total_amount, profiles(display_name)")
        .in("status", FULFILLMENT_STATUSES)
        .order("created_at", { ascending: false }),
    ]);
    pending = (pendingRows ?? []) as unknown as PendingForecast[];
    needsQc = (qcRows ?? []) as unknown as QcAllocation[];
    fulfillmentOrders = (orderRows ?? []) as unknown as FulfillmentOrder[];
  }

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-emerald-700"><ShieldCheck className="size-4" /> Koordinator</p>
        <h1 className="mt-2 text-3xl font-extrabold text-emerald-950">Verifikasi hub &amp; QC</h1>
        <p className="mt-2 text-zinc-600">Setujui harga/stok petani sebelum tampil ke pembeli, lalu catat hasil timbang di hub.</p>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950"><PackageSearch className="size-5" /> Listing menunggu verifikasi</h2>
          {!hasSupabaseEnv() && <p className="mt-3 text-sm text-zinc-500">Supabase belum dikonfigurasi.</p>}
          {hasSupabaseEnv() && pending.length === 0 && <p className="mt-3 text-sm text-zinc-500">Tidak ada listing yang menunggu verifikasi.</p>}
          <div className="mt-3 space-y-3">
            {pending.map((forecast) => {
              const minPrice = forecast.production_cost_per_kg ? Math.ceil(forecast.production_cost_per_kg * 1.2) : null;
              const priceOk = minPrice === null || (forecast.price_per_kg ?? 0) >= minPrice;
              return (
                <article key={forecast.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold text-emerald-950">{forecast.commodities?.name ?? "Komoditas"} · {forecast.est_kg.toLocaleString("id-ID")} kg · Grade {forecast.grade}</p>
                      <p className="mt-1 text-sm text-zinc-500">{forecast.profiles?.display_name ?? "Petani"} · {forecast.profiles?.regency ?? "-"}</p>
                    </div>
                    <Badge variant={priceOk ? "default" : "destructive"} className={priceOk ? "bg-emerald-700" : ""}>
                      {priceOk ? "Harga sesuai batas bawah" : "Harga di bawah batas"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm text-zinc-600">
                    Modal Rp{(forecast.production_cost_per_kg ?? 0).toLocaleString("id-ID")}/kg · Harga jual Rp{(forecast.price_per_kg ?? 0).toLocaleString("id-ID")}/kg
                    {minPrice !== null && <> · Minimum Rp{minPrice.toLocaleString("id-ID")}/kg</>}
                  </p>
                  <div className="mt-4"><VerifyButtons forecastId={forecast.id} /></div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950"><ClipboardCheck className="size-5" /> Pesanan &amp; pengiriman</h2>
          {hasSupabaseEnv() && fulfillmentOrders.length === 0 && <p className="mt-3 text-sm text-zinc-500">Belum ada pesanan yang siap diproses.</p>}
          <div className="mt-3 space-y-3">
            {fulfillmentOrders.map((order) => (
              <article key={order.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-extrabold text-emerald-950">Pesanan {order.id.slice(0, 8)} · {order.profiles?.display_name ?? "Pembeli"}</p>
                    <p className="mt-1 text-sm text-zinc-500">Status {order.status} · Rp{Number(order.total_amount).toLocaleString("id-ID")}</p>
                  </div>
                  <FulfillmentActions orderId={order.id} status={order.status} />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950"><ClipboardCheck className="size-5" /> QC di hub</h2>
          {hasSupabaseEnv() && needsQc.length === 0 && <p className="mt-3 text-sm text-zinc-500">Tidak ada alokasi terkonfirmasi yang menunggu timbang.</p>}
          <div className="mt-3 space-y-3">
            {needsQc.map((allocation) => (
              <article key={allocation.id} className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm">
                <p className="text-lg font-extrabold text-emerald-950">{allocation.buyer_requests?.commodities?.name ?? "Komoditas"} · Komitmen {allocation.committed_kg.toLocaleString("id-ID")} kg</p>
                <p className="mt-1 text-sm text-zinc-500">{allocation.profiles?.display_name ?? "Petani"} · Peran {allocation.role === "primary" ? "utama" : "cadangan"}</p>
                <div className="mt-4"><QcForm allocationId={allocation.id} committedKg={allocation.committed_kg} /></div>
              </article>
            ))}
          </div>
        </section>

        <p className="mt-10 text-xs text-zinc-400">
          Jika berat aktual kurang dari komitmen, selisihnya otomatis memicu cadangan — bukan kegagalan total.
          <Link href="/coordinator/demo" className="ml-1 font-semibold text-emerald-700 hover:underline">Lihat di ruang demo</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
