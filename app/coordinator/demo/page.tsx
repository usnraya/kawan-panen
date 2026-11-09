import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, GitBranch, PackageCheck, ShieldAlert } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CoordinatorNav } from "@/components/coordinator-nav";
import { Badge } from "@/components/ui/badge";
import { DemoControls } from "./demo-controls";

export const instant = false;

type DemoRequest = {
  id: string;
  qty_kg: number;
  delivery_date: string;
  status: string;
  shortfall_kg: number;
  commodities: { name: string } | null;
};

type DemoAllocation = {
  id: string;
  request_id: string;
  role: string;
  committed_kg: number;
  status: string;
  buyer_requests: { commodities: { name: string } | null } | null;
  profiles: { display_name: string; regency: string } | null;
};

export default async function CoordinatorDemoPage() {
  await getProfileForRole("coordinator");
  let request: DemoRequest | null = null;
  let allocations: DemoAllocation[] = [];

  if (hasSupabaseAdminEnv()) {
    const admin = createAdminClient();
    const { data: requestRow } = await admin
      .from("buyer_requests")
      .select("id, qty_kg, delivery_date, status, shortfall_kg, commodities(name)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    request = requestRow as unknown as DemoRequest | null;
    if (request) {
      const { data: allocationRows } = await admin
        .from("allocations")
        .select("id, request_id, role, committed_kg, status, buyer_requests(commodities(name)), profiles(display_name, regency)")
        .eq("request_id", request.id)
        .order("role", { ascending: true });
      allocations = (allocationRows ?? []) as unknown as DemoAllocation[];
    }
  }

  const primary = allocations.filter((allocation) => allocation.role === "primary");
  const backup = allocations.filter((allocation) => allocation.role === "backup");
  const confirmedKg = allocations.filter((allocation) => allocation.status === "CONFIRMED").reduce((sum, allocation) => sum + allocation.committed_kg, 0);

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <CoordinatorNav current="/coordinator/demo" />
        <Link href="/coordinator/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft className="size-4" /> Kembali ke dasbor</Link>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-700">Ruang demo</p>
            <h1 className="mt-2 text-3xl font-extrabold text-emerald-950 sm:text-4xl">300 kg tomat tetap terpenuhi</h1>
            <p className="mt-2 max-w-2xl text-zinc-600">Tunjukkan cara Kawan Panen menjaga permintaan hotel saat pemasok utama tidak dapat memenuhi alokasi.</p>
          </div>
          <Badge className="bg-emerald-700 px-3 py-1.5">Rule-based allocation</Badge>
        </div>

        <section className="mt-8 grid gap-4 sm:grid-cols-4">
          <Metric label="Kebutuhan" value={request ? `${request.qty_kg.toLocaleString("id-ID")} kg` : "300 kg"} />
          <Metric label="Status" value={request?.status ?? "MATCHED"} />
          <Metric label="Terkonfirmasi" value={`${confirmedKg.toLocaleString("id-ID")} kg`} />
          <Metric label="Shortfall" value={`${(request?.shortfall_kg ?? 0).toLocaleString("id-ID")} kg`} />
        </section>

        <div className="mt-8"><DemoControls /></div>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <AllocationGroup title="Pemasok utama" icon={<PackageCheck className="size-5" />} rows={primary} empty="Belum ada alokasi utama." />
          <AllocationGroup title="Pemasok cadangan" icon={<GitBranch className="size-5" />} rows={backup} empty="Cadangan belum disiapkan." />
        </section>

        <section className="mt-8 rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950"><ShieldAlert className="size-5 text-amber-600" /> Urutan presentasi</h2>
          <ol className="mt-5 grid gap-3 text-sm text-zinc-700 sm:grid-cols-4">
            <Step number="01" title="Ajukan" text="Buyer mengajukan 300 kg tomat." />
            <Step number="02" title="Alokasikan" text="Pemasok utama dan cadangan disiapkan." />
            <Step number="03" title="Simulasikan" text="Pemasok utama gagal memenuhi alokasi." />
            <Step number="04" title="Pulihkan" text="Cadangan dipromosikan, permintaan tetap berjalan." />
          </ol>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-emerald-950/10 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-2 break-words text-2xl font-extrabold text-emerald-950">{value}</p></div>;
}

function AllocationGroup({ title, icon, rows, empty }: { title: string; icon: ReactNode; rows: DemoAllocation[]; empty: string }) {
  return <section className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-extrabold text-emerald-950">{icon}{title}</h2>{rows.length === 0 ? <p className="mt-5 text-sm text-zinc-500">{empty}</p> : <div className="mt-4 space-y-3">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 p-4"><div><p className="font-bold text-emerald-950">{row.profiles?.display_name ?? "Kelompok tani simulasi"}</p><p className="text-sm text-zinc-500">{row.profiles?.regency ?? "Bali"} · {row.committed_kg.toLocaleString("id-ID")} kg</p></div><Badge className={row.status === "CONFIRMED" ? "bg-emerald-700" : row.status === "PROPOSED" ? "bg-amber-600" : "bg-zinc-600"}>{row.status}</Badge></div>)}</div>}</section>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <li className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-extrabold tracking-[0.14em] text-emerald-700">{number}</p><p className="mt-2 font-bold text-emerald-950">{title}</p><p className="mt-1 text-zinc-600">{text}</p><CheckCircle2 className="mt-3 size-4 text-emerald-700" /></li>;
}
