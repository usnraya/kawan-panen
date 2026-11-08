"use client";

import { useState, useTransition } from "react";
import { respondToAllocation } from "./actions";

export function RespondButtons({ allocationId }: { allocationId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function respond(action: "confirm" | "decline") {
    startTransition(async () => {
      const result = await respondToAllocation(allocationId, action);
      setError(result?.error ?? null);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" disabled={pending} onClick={() => respond("confirm")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Konfirmasi</button>
      <button type="button" disabled={pending} onClick={() => respond("decline")} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60">Tolak</button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
