import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";

export const instant = false;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draf", OPEN: "Diajukan", MATCHED: "Tercocok", PARTIAL: "Sebagian terpenuhi",
  FALLBACK_ACTIVE: "Cadangan aktif", CONFIRMED: "Terkonfirmasi", DELIVERED: "Terkirim",
  CLOSED: "Selesai", CANCELLED: "Dibatalkan",
};

const ALLOCATION_STATUS_LABEL: Record<string, string> = {
  PROPOSED: "Menunggu konfirmasi", STANDBY: "Siaga cadangan", CONFIRMED: "Terkonfirmasi",
  DECLINED: "Ditolak", EXPIRED: "Tenggat lewat", DELIVERED: "Terkirim", FAILED: "Gagal",
};

const EVENT_LABEL: Record<string, string> = {
  matched: "Pasokan tercocok", partial: "Pasokan sebagian", confirmed: "Petani konfirmasi",
  declined: "Petani menolak", expired: "Tenggat konfirmasi lewat", fallback_triggered: "Cadangan diaktifkan",
  backup_promoted: "Pemasok cadangan dipromosikan",
};

type RequestDetail = {
  id: string;
  qty_kg: number;
  delivery_date: string;
  min_grade: string;
  status: string;
  shortfall_kg: number;
  created_at: string;
  commodities: { name: string } | null;
};

type AllocationRow = {
  id: string;
  role: "primary" | "backup";
  committed_kg: number;
  status: string;
  confirm_deadline: string | null;
  profiles: { display_name: string; regency: string } | null;
};

type EventRow = { id: number; type: string; created_at: string };

type RequestDetailPageProps = { params: Promise<{ id: string }> };

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const { id } = await params;
  const profile = await getProfileForRole("buyer");
  if (!hasSupabaseEnv()) notFound();

  const supabase = await createClient();
  const { data: request } = await supabase
    .from("buyer_requests")
    .select("id, qty_kg, delivery_date, min_grade, status, shortfall_kg, created_at, commodities(name)")
    .eq("id", id)
    .eq("buyer_id", profile.id)
    .single();
  if (!request) notFound();

  const [{ data: allocationRows }, { data: eventRows }] = await Promise.all([
    supabase.from("allocations").select("id, role, committed_kg, status, confirm_deadline, profiles(display_name, regency)").eq("request_id", id).order("role"),
    supabase.from("events").select("id, type, created_at").eq("request_id", id).order("created_at"),
  ]);

  const detail = request as unknown as RequestDetail;
  const allocations = (allocationRows ?? []) as unknown as AllocationRow[];
  const events = (eventRows ?? []) as EventRow[];
  const confirmedKg = allocations.filter((a) => a.role === "primary" && a.status === "CONFIRMED").reduce((sum, a) => sum + a.committed_kg, 0);
  const primary = allocations.filter((a) => a.role === "primary");
  const backup = allocations.filter((a) => a.role === "backup");

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <Link href="/buyer/requests" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft className="size-4" /> Kembali ke permintaan</Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-emerald-950">{detail.commodities?.name ?? "Permintaan"} · {detail.qty_kg.toLocaleString("id-ID")} kg</h1>
            <p className="mt-2 text-zinc-600">Kirim {detail.delivery_date} · Grade minimum {detail.min_grade}</p>
          </div>
          <Badge className="bg-emerald-700 text-sm">{STATUS_LABEL[detail.status] ?? detail.status}</Badge>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Diminta</p><p className="mt-1.5 text-2xl font-extrabold text-emerald-950">{detail.qty_kg.toLocaleString("id-ID")} kg</p></div>
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Terkonfirmasi</p><p className="mt-1.5 text-2xl font-extrabold text-emerald-700">{confirmedKg.toLocaleString("id-ID")} kg</p></div>
          <div className="rounded-2xl border border-emerald-950/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Kekurangan</p><p className="mt-1.5 text-2xl font-extrabold text-zinc-900">{detail.shortfall_kg.toLocaleString("id-ID")} kg</p></div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-extrabold text-emerald-950">Pemasok utama</h2>
          {primary.length === 0 && <p className="mt-2 text-sm text-zinc-500">Belum ada pemasok utama.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {primary.map((allocation) => (
              <div key={allocation.id} className="rounded-2xl border border-emerald-950/10 bg-white p-4">
                <div className="flex items-center justify-between"><p className="font-bold text-emerald-950">{allocation.profiles?.display_name ?? "Pemasok"}</p><Badge variant="secondary">{ALLOCATION_STATUS_LABEL[allocation.status] ?? allocation.status}</Badge></div>
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="size-3.5" /> {allocation.profiles?.regency ?? "—"}</p>
                <p className="mt-2 text-sm font-semibold text-emerald-700">{allocation.committed_kg.toLocaleString("id-ID")} kg</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-extrabold text-emerald-950">Pemasok cadangan</h2>
          {backup.length === 0 && <p className="mt-2 text-sm text-zinc-500">Belum ada pemasok cadangan.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {backup.map((allocation) => (
              <div key={allocation.id} className="rounded-2xl border border-dashed border-emerald-950/15 bg-white p-4">
                <div className="flex items-center justify-between"><p className="font-bold text-emerald-950">{allocation.profiles?.display_name ?? "Pemasok"}</p><Badge variant="secondary">{ALLOCATION_STATUS_LABEL[allocation.status] ?? allocation.status}</Badge></div>
                <p className="mt-1 flex items-center gap-1 text-xs text-zinc-500"><MapPin className="size-3.5" /> {allocation.profiles?.regency ?? "—"}</p>
                <p className="mt-2 text-sm font-semibold text-zinc-600">Siaga {allocation.committed_kg.toLocaleString("id-ID")} kg</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950"><Clock className="size-4" /> Riwayat</h2>
          <div className="mt-3 space-y-2">
            {events.length === 0 && <p className="text-sm text-zinc-500">Belum ada riwayat.</p>}
            {events.map((event) => (
              <div key={event.id} className="flex items-center gap-3 rounded-xl border border-emerald-950/10 bg-white px-4 py-3 text-sm">
                <PackageCheck className="size-4 text-emerald-700" />
                <span className="font-semibold text-emerald-950">{EVENT_LABEL[event.type] ?? event.type}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">{new Date(event.created_at).toLocaleString("id-ID")}</span>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-8 flex items-center gap-2 text-xs text-zinc-400"><ShieldCheck className="size-3.5" /> Nama pemasok di atas adalah nama kelompok tani, bukan identitas pribadi.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
