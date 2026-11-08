"use client";

import { useState, useTransition } from "react";
import { verifyForecast } from "./actions";

export function VerifyButtons({ forecastId }: { forecastId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(decision: "verified" | "rejected") {
    startTransition(async () => {
      const result = await verifyForecast(forecastId, decision);
      if (result.error) setError(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending} onClick={() => submit("verified")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Verifikasi listing</button>
      <button type="button" disabled={pending} onClick={() => submit("rejected")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">Tolak</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
