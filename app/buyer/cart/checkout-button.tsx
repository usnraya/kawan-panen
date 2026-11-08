"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { checkout, type CheckoutActionState } from "./checkout-actions";

export function CheckoutButton({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<CheckoutActionState, FormData>(checkout, null);
  return (
    <>
      <form action={action}>
        <Button type="submit" disabled={pending || disabled} className="mt-5 h-12 w-full bg-emerald-800 font-bold hover:bg-emerald-900">{pending ? "Menyiapkan pembayaran..." : "Lanjut ke pembayaran"}</Button>
      </form>
      {state?.error === "LOGIN_REQUIRED" && <p className="mt-3 text-sm font-semibold text-amber-800"><a href="/login?next=/buyer/cart" className="underline">Masuk sebagai buyer</a> untuk melanjutkan.</p>}
      {state?.error && state.error !== "LOGIN_REQUIRED" && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
    </>
  );
}
