"use client";

import Script from "next/script";
import { useState } from "react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    snap?: { pay: (token: string, options?: Record<string, unknown>) => void };
  }
}

export function PaySnapButton({ snapToken, clientKey, orderId }: { snapToken: string; clientKey: string; orderId: string }) {
  const [ready, setReady] = useState(false);
  const src = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

  return (
    <>
      <Script src={src} data-client-key={clientKey} onLoad={() => setReady(true)} />
      <Button type="button" disabled={!ready || !clientKey} onClick={() => window.snap?.pay(snapToken, { onSuccess: () => window.location.reload(), onPending: () => window.location.reload(), onError: () => window.location.reload() })} className="h-12 w-full bg-emerald-800 font-bold hover:bg-emerald-900">{ready ? "Bayar dengan Midtrans" : "Memuat pembayaran..."}</Button>
      <p className="mt-2 text-center text-xs text-zinc-500">Order ID: {orderId}</p>
    </>
  );
}
