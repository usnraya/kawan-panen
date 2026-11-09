"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState, type MouseEvent, type ReactNode } from "react";
import { AlertTriangle, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removeItem, updateItem, type CartActionState } from "./actions";
import type { CartLine } from "@/lib/commerce";
import { MIN_ORDER_KG, ORDER_STEP_KG } from "@/lib/catalog-data";

type CartClientProps = { lines: CartLine[]; total: number; checkoutSlot: ReactNode };

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

function LineActions({ line }: { line: CartLine }) {
  const [state, action, pending] = useActionState<CartActionState, FormData>(updateItem, null);
  const [qty, setQty] = useState(line.qtyKg);

  function step(delta: number, event: MouseEvent<HTMLButtonElement>) {
    const next = Math.min(line.availableKg, Math.max(MIN_ORDER_KG, qty + delta));
    setQty(next);
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <div className="flex flex-col gap-1">
      <form action={action} className="flex items-center gap-2">
        <input type="hidden" name="productId" value={line.productId} />
        <input type="hidden" name="qtyKg" value={qty} readOnly />
        <button type="submit" onClick={(event) => step(-ORDER_STEP_KG, event)} disabled={pending || qty <= MIN_ORDER_KG} aria-label={`Kurangi ${line.name}`} className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 transition active:scale-95 active:bg-emerald-100 disabled:opacity-40 disabled:active:scale-100"><Minus className="size-4" /></button>
        <input
          type="number"
          min={MIN_ORDER_KG}
          max={line.availableKg}
          step={ORDER_STEP_KG}
          value={qty}
          onChange={(event) => setQty(Number(event.target.value))}
          onBlur={(event) => {
            if (Number(event.target.value) !== line.qtyKg) event.currentTarget.form?.requestSubmit();
          }}
          disabled={pending}
          aria-label={`Jumlah ${line.name} (kg)`}
          className="h-9 w-16 rounded-lg border border-zinc-200 text-center text-sm font-bold text-emerald-950 outline-none focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/30"
        />
        <button type="submit" onClick={(event) => step(ORDER_STEP_KG, event)} disabled={pending || qty >= line.availableKg} aria-label={`Tambah ${line.name}`} className="rounded-lg border border-zinc-200 p-1.5 text-zinc-600 transition active:scale-95 active:bg-emerald-100 disabled:opacity-40 disabled:active:scale-100"><Plus className="size-4" /></button>
      </form>
      {state?.error && <p role="alert" className="text-xs font-semibold text-red-600">{state.error}</p>}
    </div>
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
      <aside className="h-fit rounded-3xl border border-emerald-950/10 bg-white p-5 shadow-sm"><h2 className="text-lg font-extrabold text-emerald-950">Ringkasan pesanan</h2><div className="mt-5 flex justify-between border-t border-zinc-100 pt-4 text-base font-extrabold text-emerald-950"><span>Total sementara</span><span>{currency.format(total)}</span></div>{!canCheckout && <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> Sesuaikan jumlah produk di atas sampai stok terverifikasi cukup sebelum lanjut ke pembayaran.</p>}{checkoutSlot}<p className="mt-4 text-xs leading-5 text-zinc-500">Pembayaran menggunakan Midtrans Snap sandbox. Status pembayaran hanya dikonfirmasi setelah verifikasi server.</p></aside>
    </div>
  );
}
