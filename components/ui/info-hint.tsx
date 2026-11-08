import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible helper text behind a small (i) icon — keeps forms clean while
 * keeping the explanation one click away. No JS needed: <details> handles it.
 */
export function InfoHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <details className={cn("group relative inline-block", className)}>
      <summary className="inline-flex size-5 list-none items-center justify-center rounded-full text-zinc-400 marker:content-none hover:bg-zinc-100 hover:text-emerald-700 [&::-webkit-details-marker]:hidden">
        <Info className="size-4" />
        <span className="sr-only">Info</span>
      </summary>
      <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-600 shadow-lg">
        {children}
      </div>
    </details>
  );
}
