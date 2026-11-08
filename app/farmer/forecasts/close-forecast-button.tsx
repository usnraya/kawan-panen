"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeForecast } from "./actions";

export function CloseForecastButton({ forecastId }: { forecastId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => closeForecast(forecastId))}
    >
      {pending ? "Menutup…" : "Tutup"}
    </Button>
  );
}
