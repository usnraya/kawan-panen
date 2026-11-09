"use client";

import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form
      action={signOut}
      onSubmit={(event) => {
        if (!window.confirm("Keluar dari akun ini?")) event.preventDefault();
      }}
    >
      <button
        type="submit"
        aria-label="Keluar"
        title="Keluar"
        className="flex items-center gap-1.5 rounded-xl p-2.5 text-zinc-500 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/40 active:translate-y-px"
      >
        <LogOut className="size-5" />
        <span className="hidden text-sm font-semibold sm:inline">Keluar</span>
      </button>
    </form>
  );
}
