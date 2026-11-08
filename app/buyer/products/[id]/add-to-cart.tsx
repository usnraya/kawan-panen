"use client";

import { useActionState, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addItem, type CartActionState } from "@/app/buyer/cart/actions";
import { MIN_ORDER_KG, ORDER_STEP_KG } from "@/lib/catalog-data";

export function AddToCart({ productId, availableKg }: { productId: string; availableKg: number }) {
  const [qtyKg, setQtyKg] = useState(MIN_ORDER_KG);
  const [state, action, pending] = useActionState<CartActionState, FormData>(addItem, null);

  return (
    <div className="rounded-2xl border border-emerald-950/10 bg-emerald-50/70 p-4">
      <p className="mb-3 text-xs font-semibold text-emerald-800">Pembelian grosir, minimum {MIN_ORDER_KG} kg per produk.</p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="productId" value={productId} />
        <label className="flex flex-col gap-1 text-xs font-bold text-emerald-950">Jumlah (kg)<input name="qtyKg" type="number" min={MIN_ORDER_KG} max={availableKg} step={ORDER_STEP_KG} value={qtyKg} onChange={(event) => setQtyKg(Number(event.target.value))} className="h-11 w-28 rounded-xl border border-emerald-950/15 bg-white px-3 text-sm" required /></label>
        <Button type="submit" disabled={pending} className="h-11 flex-1 bg-emerald-800 font-bold hover:bg-emerald-900 sm:flex-none"><ShoppingCart className="mr-2 size-4" />{pending ? "Menambahkan..." : "Tambah ke keranjang"}</Button>
      </form>
      {state?.success && <p className="mt-3 text-sm font-semibold text-emerald-700">{state.success} <a href="/buyer/cart" className="underline">Lihat keranjang</a></p>}
      {state?.error === "LOGIN_REQUIRED" && <p className="mt-3 text-sm font-semibold text-amber-800"><a href={`/login?next=/buyer/products/${productId}`} className="underline">Masuk sebagai buyer</a> untuk menambahkan produk.</p>}
      {state?.error && state.error !== "LOGIN_REQUIRED" && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
    </div>
  );
}
