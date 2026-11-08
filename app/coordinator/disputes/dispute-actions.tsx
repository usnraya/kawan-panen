"use client";

import { useState, useTransition } from "react";
import { resolveDispute } from "./actions";
import { Button } from "@/components/ui/button";

export function DisputeActions({ orderId, totalAmount }: { orderId: string; totalAmount: number }) {
  const [pending, startTransition] = useTransition();
  const [partial, setPartial] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  function run(decision: "refund_full" | "refund_partial" | "reject") {
    startTransition(async () => {
      const amount = decision === "refund_partial" ? Number(partial) : undefined;
      const result = await resolveDispute(orderId, decision, amount);
      if (result?.error) setMessage(result.error);
      else window.location.reload();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" disabled={pending} onClick={() => run("refund_full")} className="h-9 bg-red-700 text-xs font-bold hover:bg-red-800">
        Refund penuh ({totalAmount.toLocaleString("id-ID")})
      </Button>
      <input
        type="number"
        min="1"
        max={totalAmount}
        value={partial}
        onChange={(event) => setPartial(event.target.value)}
        placeholder="Nominal sebagian"
        className="h-9 w-36 rounded-md border border-input px-2 text-xs"
      />
      <Button type="button" disabled={pending || !partial} onClick={() => run("refund_partial")} variant="outline" className="h-9 text-xs font-bold">
        Refund sebagian
      </Button>
      <Button type="button" disabled={pending} onClick={() => run("reject")} variant="ghost" className="h-9 text-xs font-bold text-zinc-600">
        Tolak komplain
      </Button>
      {message && <span className="text-xs text-red-600">{message}</span>}
    </div>
  );
}
