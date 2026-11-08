"use client";

import { useState, useTransition } from "react";
import { runDeadlineCheck, simulatePrimaryFailure } from "./actions";

export function DemoControls() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<{ ok?: boolean; error?: string; count?: number }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) setMessage(result.error);
      else if (typeof result.count === "number") setMessage(`Selesai. ${result.count} alokasi melewati tenggat diproses.`);
      else setMessage("Selesai. Kegagalan pemasok utama disimulasikan dan cadangan dipromosikan.");
    });
  }

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6">
      <p className="text-sm font-bold text-amber-900">Kontrol simulasi juri</p>
      <p className="mt-1 text-sm text-amber-800">Jalankan skenario fallback secara langsung untuk demo.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(simulatePrimaryFailure)}
          className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          Simulasikan pemasok utama gagal
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(runDeadlineCheck)}
          className="rounded-xl border border-amber-700 px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-60"
        >
          Jalankan pengecekan tenggat
        </button>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-amber-900">{message}</p>}
    </div>
  );
}
