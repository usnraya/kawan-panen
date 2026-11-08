"use client";

import { useState, useTransition } from "react";
import { confirmReceipt, fileComplaint } from "@/app/buyer/orders/actions";
import { Button } from "@/components/ui/button";

export function OrderActionButtons({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showComplaint, setShowComplaint] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function confirm() {
    startTransition(async () => {
      const result = await confirmReceipt(orderId);
      if (result?.error) setMessage(result.error);
      else window.location.reload();
    });
  }

  function complain() {
    startTransition(async () => {
      const result = await fileComplaint(orderId, reason);
      if (result?.error) setMessage(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" disabled={pending} onClick={confirm} className="h-12 w-full bg-emerald-800 font-bold hover:bg-emerald-900">
        {pending ? "Memproses…" : "Konfirmasi terima — cairkan dana"}
      </Button>
      {!showComplaint && (
        <button type="button" onClick={() => setShowComplaint(true)} className="text-xs font-semibold text-red-700 hover:underline">
          Ada masalah dengan pesanan ini? Ajukan komplain
        </button>
      )}
      {showComplaint && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Jelaskan masalahnya (misalnya berat/kualitas tidak sesuai)…"
            className="h-20 w-full rounded-md border border-red-200 bg-white p-2 text-sm"
          />
          <Button type="button" disabled={pending || !reason.trim()} onClick={complain} variant="destructive" className="mt-2 h-9 font-bold">
            {pending ? "Mengirim…" : "Kirim komplain"}
          </Button>
        </div>
      )}
      {message && <p className="text-xs text-red-600">{message}</p>}
    </div>
  );
}
