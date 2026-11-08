"use client";

import { useState, useTransition } from "react";
import { advanceOrderToDelivered, advanceOrderToHub, advanceOrderToInTransit, advanceOrderToQcDone } from "./actions";

const nextAction = {
  PAID: { label: "Tandai tiba di hub", run: advanceOrderToHub },
  AT_HUB: { label: "Selesaikan QC pesanan", run: advanceOrderToQcDone },
  QC_DONE: { label: "Kirim pesanan", run: advanceOrderToInTransit },
  IN_TRANSIT: { label: "Tandai terkirim", run: advanceOrderToDelivered },
} as const;

export function FulfillmentActions({ orderId, status }: { orderId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const action = nextAction[status as keyof typeof nextAction];
  if (!action) return <span className="text-xs text-zinc-500">Menunggu proses berikutnya.</span>;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => {
          const result = await action.run(orderId);
          setMessage("error" in result ? result.error ?? "Aksi gagal." : "Status pesanan diperbarui.");
        })}
        className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-60"
      >
        {pending ? "Memproses…" : action.label}
      </button>
      {message && <span className="text-xs font-semibold text-emerald-800">{message}</span>}
    </div>
  );
}
