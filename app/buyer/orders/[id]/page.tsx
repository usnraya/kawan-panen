import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { getMidtransClientKey } from "@/lib/midtrans";
import { PaySnapButton } from "./pay-snap-button";
import { ConfirmMockPaymentButton } from "./confirm-mock-payment-button";
import { OrderActionButtons } from "./order-action-buttons";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Menunggu pembayaran",
  AWAITING_FARMER: "Menunggu konfirmasi petani",
  CONFIRMED: "Dikonfirmasi petani",
  PAID: "Lunas — dana ditahan",
  AT_HUB: "Tiba di hub",
  QC_DONE: "Lolos pemeriksaan kualitas",
  IN_TRANSIT: "Dalam pengiriman",
  DELIVERED: "Terkirim",
  COMPLETED: "Selesai — dana dicairkan",
  DISPUTED: "Dalam komplain",
  CANCELLED: "Dibatalkan",
};

export const instant = false;

type OrderDetailPageProps = { params: Promise<{ id: string }> };

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  if (!hasSupabaseEnv() || !hasSupabaseAdminEnv()) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/buyer/orders/${id}`);

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, buyer_id, status, total_amount, created_at")
    .eq("id", id)
    .single();
  if (!order || order.buyer_id !== user.id) notFound();

  const [{ data: items }, { data: payment }] = await Promise.all([
    admin.from("order_items").select("product_name, supplier_label, grade, unit_price, qty_kg, subtotal").eq("order_id", id),
    admin.from("payment_transactions").select("snap_token, status, provider").eq("order_id", id).maybeSingle(),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-extrabold text-emerald-950">Pesanan #{order.id.slice(0, 8)}</h1>
        <p className="mt-1 text-sm text-zinc-500">Dibuat {new Date(order.created_at).toLocaleString("id-ID")}</p>
        <span className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">{STATUS_LABEL[order.status] ?? order.status}</span>

        <div className="mt-6 space-y-3">
          {(items ?? []).map((item, index) => (
            <div key={index} className="flex items-center justify-between rounded-2xl border border-emerald-950/10 bg-white p-4">
              <div><p className="font-bold text-emerald-950">{item.product_name}</p><p className="text-xs text-zinc-500">{item.supplier_label} · Grade {item.grade} · {item.qty_kg} kg</p></div>
              <p className="font-bold text-emerald-950">{currency.format(item.subtotal)}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-between rounded-2xl bg-emerald-950 p-5 text-white"><span className="font-bold">Total</span><span className="font-extrabold">{currency.format(order.total_amount)}</span></div>

        {order.status === "DRAFT" && payment?.provider === "midtrans" && payment.snap_token && (
          <div className="mt-6">
            <PaySnapButton snapToken={payment.snap_token} clientKey={getMidtransClientKey()} orderId={order.id} />
            <p className="mt-3 text-xs text-zinc-500">Pembayaran sandbox Midtrans. Status di halaman ini hanya berubah setelah server memverifikasi notifikasi dari Midtrans — bukan dari browser.</p>
          </div>
        )}

        {order.status === "DRAFT" && payment?.provider === "mock" && (
          <div className="mt-6">
            <ConfirmMockPaymentButton orderId={order.id} />
            <p className="mt-3 text-xs text-zinc-500">Simulasi pembayaran demo (tanpa Midtrans). DATA SIMULASI — tidak ada uang nyata berpindah.</p>
          </div>
        )}

        {order.status === "DELIVERED" && payment?.status === "PAID_HELD" && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="mb-3 text-sm font-semibold text-emerald-950">Pesanan sudah diterima kurir. Konfirmasi penerimaan untuk mencairkan dana ke pemasok.</p>
            <OrderActionButtons orderId={order.id} />
          </div>
        )}
        {order.status === "DISPUTED" && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Komplain tercatat. Koordinator akan meninjau pesanan ini dan menentukan penyelesaian.
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
