import { hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { getProfileForRole } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CoordinatorNav } from "@/components/coordinator-nav";
import { DisputeActions } from "./dispute-actions";

export const instant = false;

export default async function CoordinatorDisputesPage() {
  await getProfileForRole("coordinator");
  let disputes: Array<{ id: string; buyer_id: string; total_amount: number; created_at: string }> = [];
  if (hasSupabaseEnv() && hasSupabaseAdminEnv()) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("orders")
      .select("id, buyer_id, total_amount, created_at")
      .eq("status", "DISPUTED")
      .order("created_at", { ascending: false });
    disputes = (data ?? []).map((row) => ({ ...row, total_amount: Number(row.total_amount) }));
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <CoordinatorNav current="/coordinator/disputes" />
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-700">Operasional koordinator</p>
        <h1 className="mt-2 text-3xl font-extrabold text-emerald-950">Komplain &amp; penyelesaian</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">Tinjau komplain buyer. Refund dicatat sebagai transaksi ledger berimbang dan diproses idempotent.</p>
        <section className="mt-8 space-y-3">
          {disputes.length === 0 && <p className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">Belum ada komplain aktif.</p>}
          {disputes.map((dispute) => (
            <article key={dispute.id} className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-extrabold text-emerald-950">Pesanan #{dispute.id.slice(0, 8)}</p>
                  <p className="mt-1 text-xs text-zinc-500">Buyer {dispute.buyer_id.slice(0, 8)} · {new Date(dispute.created_at).toLocaleString("id-ID")}</p>
                  <p className="mt-2 text-sm font-bold text-zinc-800">Total {dispute.total_amount.toLocaleString("id-ID")} IDR</p>
                </div>
                <DisputeActions orderId={dispute.id} totalAmount={dispute.total_amount} />
              </div>
            </article>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
