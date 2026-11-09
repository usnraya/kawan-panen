import Link from "next/link";
import { Activity, BarChart3, ShieldCheck } from "lucide-react";
import { getProfileForRole } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CoordinatorNav } from "@/components/coordinator-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const instant = false;

const metrics = [
  { label: "Pemenuhan permintaan", value: "92%", note: "dari kebutuhan teralokasi", icon: Activity },
  { label: "Pasokan cadangan", value: "8%", note: "siap diaktifkan", icon: ShieldCheck },
  { label: "Volume terhubung", value: "1.775 kg", note: "untuk 4 minggu ke depan", icon: BarChart3 },
];

export default async function CoordinatorDashboardPage() {
  const profile = await getProfileForRole("coordinator");

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <CoordinatorNav current="/coordinator/dashboard" />
      <p className="text-sm font-semibold text-emerald-700">Koordinator</p>
      <h1 className="mt-1 text-3xl font-extrabold text-emerald-950">Dasbor koordinasi</h1>
      <p className="mt-3 text-zinc-600">Pantau kesehatan pasokan dan kesiapan alokasi dari satu tempat.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {metrics.map(({ label, value, note, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm font-semibold text-zinc-500">{label}</p>
              <Icon className="size-5 text-emerald-700" />
            </div>
            <p className="mt-4 text-3xl font-extrabold text-emerald-950">{value}</p>
            <p className="mt-1 text-sm text-zinc-500">{note}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Ringkasan hari ini</p>
          <h2 className="mt-1 text-xl font-bold text-emerald-950">Halo, {profile.display_name}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">Semua alokasi berjalan sesuai jadwal. Tidak ada permintaan yang membutuhkan tindakan segera.</p>
        </div>
        <Link href="/coordinator/demo" className={cn(buttonVariants(), "h-11 shrink-0 bg-emerald-800 px-5 font-semibold hover:bg-emerald-900")}>
          Buka ruang demo
        </Link>
      </div>
      </main>
      <SiteFooter />
    </div>
  );
}
