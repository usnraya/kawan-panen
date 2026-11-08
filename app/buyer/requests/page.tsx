import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const instant = false;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf", OPEN: "Diajukan", MATCHED: "Tercocok", PARTIAL: "Sebagian",
  FALLBACK_ACTIVE: "Cadangan aktif", CONFIRMED: "Terkonfirmasi", DELIVERED: "Terkirim",
  CLOSED: "Selesai", CANCELLED: "Dibatalkan",
};

type RequestRow = {
  id: string;
  qty_kg: number;
  delivery_date: string;
  status: string;
  shortfall_kg: number;
  commodities: { name: string } | null;
};

export default async function BuyerRequestsPage() {
  const profile = await getProfileForRole("buyer");
  let requests: RequestRow[] = [];
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("buyer_requests")
      .select("id, qty_kg, delivery_date, status, shortfall_kg, commodities(name)")
      .eq("buyer_id", profile.id)
      .order("created_at", { ascending: false });
    requests = (data ?? []) as unknown as RequestRow[];
  }

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><ClipboardList className="size-4" /> Buyer</p>
            <h1 className="mt-1 text-3xl font-extrabold text-emerald-950">Permintaan saya</h1>
            <p className="mt-2 text-zinc-600">Pantau status pasokan yang sudah diajukan.</p>
          </div>
          <Link href="/buyer/availability" className={cn(buttonVariants(), "h-11 bg-emerald-800 px-5 font-semibold hover:bg-emerald-900")}>
            <Plus className="size-4" /> Ajukan baru
          </Link>
        </div>

        {!hasSupabaseEnv() && (
          <p className="mt-6 rounded-xl border border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Supabase belum dikonfigurasi, jadi daftar permintaan belum dapat ditampilkan.
          </p>
        )}

        {hasSupabaseEnv() && requests.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">
            Belum ada permintaan. Mulai dari katalog produk segar.
          </div>
        )}

        {requests.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-emerald-50 text-emerald-900">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Komoditas</th>
                  <th className="px-5 py-3.5 font-semibold">Jumlah</th>
                  <th className="px-5 py-3.5 font-semibold">Tanggal kirim</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-t border-emerald-950/5 hover:bg-emerald-50/40">
                    <td className="px-5 py-3.5 font-semibold text-emerald-950">{request.commodities?.name ?? "—"}</td>
                    <td className="px-5 py-3.5 text-zinc-700">{request.qty_kg.toLocaleString("id-ID")} kg</td>
                    <td className="px-5 py-3.5 text-zinc-700">{request.delivery_date}</td>
                    <td className="px-5 py-3.5"><Badge className="bg-emerald-700">{STATUS_LABEL[request.status] ?? request.status}</Badge></td>
                    <td className="px-5 py-3.5 text-right"><Link href={`/buyer/requests/${request.id}`} className="text-xs font-semibold text-emerald-800 hover:underline">Lihat detail</Link></td>
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
