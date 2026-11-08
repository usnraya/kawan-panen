"use client";

import { useState, useTransition } from "react";
import { recordQc } from "./actions";

export function QcForm({ allocationId, committedKg }: { allocationId: string; committedKg: number }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function submit(formData: FormData) {
    const actualKg = Number(formData.get("actualKg"));
    const gradeOk = formData.get("gradeOk") === "on";
    startTransition(async () => {
      const result = await recordQc(allocationId, actualKg, gradeOk);
      if (result.error) setMessage(result.error);
      else if (result.shortfallKg && result.shortfallKg > 0) setMessage(`QC tersimpan. Kurang ${result.shortfallKg.toLocaleString("id-ID")} kg — cadangan dipicu.`);
      else setMessage("QC tersimpan. Berat sesuai komitmen.");
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`actualKg-${allocationId}`} className="text-xs font-semibold text-zinc-600">Berat aktual (kg)</label>
        <input id={`actualKg-${allocationId}`} name="actualKg" type="number" min="0" max={committedKg} step="0.1" defaultValue={committedKg} required className="h-9 w-32 rounded-md border border-input px-2 text-sm" />
      </div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
        <input name="gradeOk" type="checkbox" defaultChecked /> Grade sesuai
      </label>
      <button type="submit" disabled={pending} className="h-9 rounded-lg bg-emerald-800 px-4 text-xs font-bold text-white hover:bg-emerald-900 disabled:opacity-60">
        {pending ? "Menyimpan…" : "Simpan QC"}
      </button>
      {message && <span className="text-xs text-emerald-800">{message}</span>}
    </form>
  );
}
