"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeItem, updateItem, type CartActionState } from "./actions";
import type { CartLine } from "@/lib/commerce";
import { MIN_ORDER_KG, ORDER_STEP_KG } from "@/lib/catalog-data";

type CartClientProps = { lines: CartLine[]; total: number; checkoutSlot: (canCheckout: boolean) => ReactNode };

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function LineActions({ line }: { line: CartLine }) {
  const [, action, pending] = useActionState<CartActionState, FormData>(updateItem, null);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="productId" value={line.productId} />
      <button type="submit" name="qtyKg" value={Math.max(MIN_ORDER_KG, line.qtyKg - ORDER_STEP_KG)} disabled={pending || line.qtyKg <= MIN_ORDER_KG} aria-label={`Kurangi ${line.name}`} className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 disabled:opacity-40"><Minus className="size-4" /></button>
      <span className="min-w-12 text-center text-sm font-bold text-emerald-950">{line.qtyKg} kg</span>
      <button type="submit" name="qtyKg" value={Math.min(line.availableKg, line.qtyKg + ORDER_STEP_KG)} disabled={pending || line.qtyKg >= line.availableKg} aria-label={`Tambah ${line.name}`} className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 disabled:opacity-40"><Plus className="size-4" /></button>
    </form>
  );
}

function RemoveButton({ productId }: { productId: string }) {
  const [, action, pending] = useActionState<CartActionState, FormData>(removeItem, null);
  return <form action={action}><input type="hidden" name="productId" value={productId} /><Button type="submit" variant="ghost" size="icon" disabled={pending} aria-label="Hapus produk" className="text-zinc-400 hover:text-red-600"><Trash2 className="size-4" /></Button></form>;
}

export function CartClient({ lines, total, checkoutSlot }: CartClientProps) {
  if (lines.length === 0) {
    return <div className="rounded-3xl border border-dashed border-emerald-950/15 bg-white p-10 text-center"><p className="text-lg font-bold text-emerald-950">Keranjang masih kosong</p><p className="mt-2 text-sm text-zinc-500">Pilih hasil panen dari katalog untuk mulai berbelanja.</p><Link href="/buyer/availability" className="mt-6 inline-flex rounded-xl bg-emerald-800 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-900">Lihat katalog</Link></div>;
  }

  const canCheckout = lines.every((line) => line.shortfallKg === 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {lines.map((line) => <article key={line.productId} className="flex gap-4 rounded-2xl border border-emerald-950/10 bg-white p-4 shadow-sm"><div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-emerald-50"><Image src={line.image} alt={line.imageAlt} fill sizes="96px" className="object-cover" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-emerald-950">{line.name}</h2><p className="mt-1 text-xs text-zinc-500">{line.supplier} · Grade {line.grade}</p></div><RemoveButton productId={line.productId} /></div><p className="mt-3 text-sm font-semibold text-emerald-800">{currency.format(line.unitPrice)} / kg</p><div className="mt-3 flex items-center justify-between gap-3"><LineActions line={line} /><span className="text-sm font-extrabold text-emerald-950">{currency.format(line.subtotal)}</span></div>{line.shortfallKg > 0 ? <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><p><strong>Stok terverifikasi belum cukup.</strong> Baru {line.matchableKg} kg dari {line.qtyKg} kg dapat dialokasikan; kurangi {line.shortfallKg} kg atau pilih produk lain sebelum pembayaran.</p></div> : <p className="mt-3 text-xs font-semibold text-emerald-700">Stok terverifikasi cukup untuk jumlah ini.</p>}</div></article>)}
      </div>
      <aside className="h-fit rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-emerald-950">Ringkasan pesanan</h2><div className="mt-5 flex justify-between border-t border-zinc-100 pt-4 text-base font-extrabold text-emerald-950"><span>Total sementara</span><span>{currency.format(total)}</span></div>{!canCheckout && <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Sesuaikan jumlah produk di atas sampai stok terverifikasi cukup sebelum lanjut ke pembayaran.</p>}{checkoutSlot(canCheckout)}<p className="mt-4 text-xs leading-5 text-zinc-500">Pembayaran menggunakan Midtrans Snap sandbox. Status pembayaran hanya dikonfirmasi setelah verifikasi server.</p></aside>
    </div>
  );
}
