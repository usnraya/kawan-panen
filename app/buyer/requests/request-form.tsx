"use client";

import { useActionState } from "react";
import { createBuyerRequest } from "./actions";

type RequestFormProps = {
  commodityId: string;
  commodityName: string;
  minGrade: "A" | "B";
  availableKg: number;
};

export function RequestForm({ commodityId, commodityName, minGrade, availableKg }: RequestFormProps) {
  const [state, formAction, pending] = useActionState(createBuyerRequest, null);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4">
      <input type="hidden" name="commodityId" value={commodityId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="qtyKg" className="text-sm font-semibold text-emerald-950">Jumlah kebutuhan (kg)</label>
        <input
          id="qtyKg"
          name="qtyKg"
          type="number"
          min={1}
          max={availableKg}
          defaultValue={Math.min(300, availableKg)}
          required
          className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
        <p className="text-xs text-zinc-500">Stok {commodityName} tercatat {availableKg} kg saat ini.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deliveryDate" className="text-sm font-semibold text-emerald-950">Tanggal kirim</label>
        <input
          id="deliveryDate"
          name="deliveryDate"
          type="date"
          required
          className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="minGrade" className="text-sm font-semibold text-emerald-950">Grade minimum</label>
        <select
          id="minGrade"
          name="minGrade"
          defaultValue={minGrade}
          className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
        >
          <option value="C">Grade C atau lebih tinggi</option>
          <option value="B">Grade B atau lebih tinggi</option>
          <option value="A">Grade A saja</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="recurrence" className="text-sm font-semibold text-emerald-950">Pengulangan</label>
        <select
          id="recurrence"
          name="recurrence"
          defaultValue="none"
          className="h-11 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-emerald-600"
        >
          <option value="none">Sekali kirim</option>
          <option value="weekly">Ulang setiap minggu</option>
        </select>
      </div>
      {state?.error && <p className="text-sm font-medium text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex h-12 w-full items-center justify-center rounded-xl bg-emerald-800 font-bold text-white transition hover:bg-emerald-900 disabled:opacity-60"
      >
        {pending ? "Mengajukan…" : "Ajukan kebutuhan"}
      </button>
    </form>
  );
}
