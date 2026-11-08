import Link from "next/link";
import { ArrowLeft, BellRing, CalendarClock, CheckCircle2, PackageCheck } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { RespondButtons } from "./respond-buttons";

export const instant = false;

type AllocationRow = {
  id: string;
  request_id: string;
  role: "primary" | "backup";
  committed_kg: number;
  status: string;
  confirm_deadline: string | null;
  buyer_requests: {
    qty_kg: number;
    delivery_date: string;
    min_grade: string;
    commodities: { name: string } | null;
  } | null;
};

const statusLabel: Record<string, string> = {
  PROPOSED: "Menunggu konfirmasi",
  STANDBY: "Siaga cadangan",
  CONFIRMED: "Terkonfirmasi",
  DECLINED: "Ditolak",
  EXPIRED: "Tenggat lewat",
  DELIVERED: "Terkirim",
  FAILED: "Gagal",
};

export default async function FarmerAllocationsPage() {
  const profile = await getProfileForRole("farmer");
  let allocations: AllocationRow[] = [];
  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("allocations")
      .select("id, request_id, role, committed_kg, status, confirm_deadline, buyer_requests(qty_kg, delivery_date, min_grade, commodities(name))")
      .eq("farmer_id", profile.id)
      .order("created_at", { ascending: false });
    allocations = (data ?? []) as unknown as AllocationRow[];
  }

  const pending = allocations.filter((allocation) => allocation.status === "PROPOSED");
  const standby = allocations.filter((allocation) => allocation.status === "STANDBY");

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/farmer/forecasts" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft className="size-4" /> Kembali ke prakiraan</Link>
        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><BellRing className="size-4" /> Ruang petani</p>
            <h1 className="mt-2 text-3xl font-extrabold text-emerald-950">Alokasi pasokan</h1>
            <p className="mt-2 text-zinc-600">Tinjau kebutuhan pembeli yang cocok dengan prakiraan panenmu.</p>
          </div>
          <div className="rounded-xl bg-emerald-100 px-4 py-2 text-sm font-bold text-emerald-800">{pending.length} perlu ditinjau</div>
        </div>

        {!hasSupabaseEnv() && <div className="mt-8 rounded-2xl border border-dashed border-emerald-300 bg-emerald-50 p-6 text-sm text-emerald-800">Supabase belum dikonfigurasi. Alokasi akan muncul setelah akun dan data pasokan tersambung.</div>}
        {hasSupabaseEnv() && allocations.length === 0 && <div className="mt-8 rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-zinc-500">Belum ada alokasi untuk prakiraan panenmu.</div>}

        {pending.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-extrabold text-emerald-950">Menunggu konfirmasi</h2>
            <div className="mt-3 space-y-3">
              {pending.map((allocation) => (
                <AllocationCard key={allocation.id} allocation={allocation} />
              ))}
            </div>
          </section>
        )}

        {standby.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-extrabold text-emerald-950">Siaga cadangan</h2>
            <p className="mt-1 text-sm text-zinc-500">Cadangan tidak perlu dikonfirmasi sebelum dipromosikan.</p>
            <div className="mt-3 space-y-3">
              {standby.map((allocation) => (
                <AllocationCard key={allocation.id} allocation={allocation} />
              ))}
            </div>
          </section>
        )}

        {allocations.filter((allocation) => !["PROPOSED", "STANDBY"].includes(allocation.status)).length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-extrabold text-emerald-950">Riwayat alokasi</h2>
            <div className="mt-3 space-y-3">
              {allocations.filter((allocation) => !["PROPOSED", "STANDBY"].includes(allocation.status)).map((allocation) => (
                <AllocationCard key={allocation.id} allocation={allocation} />
              ))}
            </div>
          </section>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

function AllocationCard({ allocation }: { allocation: AllocationRow }) {
  const request = allocation.buyer_requests;
  const isPending = allocation.status === "PROPOSED";
  const deadline = allocation.confirm_deadline
    ? new Date(allocation.confirm_deadline).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <article className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-extrabold text-emerald-950">{request?.commodities?.name ?? "Komoditas"} · {allocation.committed_kg.toLocaleString("id-ID")} kg</p>
          <p className="mt-1 text-sm text-zinc-500">Kebutuhan pembeli {request?.qty_kg.toLocaleString("id-ID")} kg · Grade minimum {request?.min_grade}</p>
        </div>
        <Badge className={allocation.status === "CONFIRMED" ? "bg-emerald-700" : allocation.status === "STANDBY" ? "bg-amber-600" : "bg-zinc-700"}>{statusLabel[allocation.status] ?? allocation.status}</Badge>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-100 pt-3 text-sm text-zinc-600">
        <span className="flex items-center gap-1.5"><CalendarClock className="size-4 text-emerald-700" /> Kirim {request?.delivery_date}</span>
        {deadline && <span className="flex items-center gap-1.5"><PackageCheck className="size-4 text-emerald-700" /> Tenggat {deadline}</span>}
        <span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-emerald-700" /> Peran {allocation.role === "primary" ? "utama" : "cadangan"}</span>
      </div>
      {isPending && <div className="mt-4"><RespondButtons allocationId={allocation.id} /></div>}
    </article>
  );
}
