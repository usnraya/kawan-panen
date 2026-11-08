"use client";

import { useTransition } from "react";
import { confirmMockPayment } from "@/app/buyer/cart/checkout-actions";
import { Button } from "@/components/ui/button";

export function ConfirmMockPaymentButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        const result = await confirmMockPayment(orderId);
        if (result?.error) window.alert(result.error);
        else window.location.reload();
      })}
      className="h-12 w-full bg-emerald-800 font-bold hover:bg-emerald-900"
    >
      {pending ? "Memproses simulasi..." : "Konfirmasi pembayaran simulasi"}
    </Button>
  );
}
