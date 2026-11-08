"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "kawan-panen-install-dismissed";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // Storage can be blocked; the install prompt still works.
    }

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!visible || !installEvent) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallEvent(null);
  }

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Non-blocking convenience only.
    }
  }

  return (
    <aside className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-emerald-950/20">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-900 text-white"><Download className="size-5" /></div>
      <div className="min-w-0 flex-1"><p className="font-bold text-emerald-950">Pasang Kawan Panen</p><p className="text-xs text-zinc-600">Akses lebih cepat dari layar utama perangkatmu.</p></div>
      <button type="button" onClick={install} className="shrink-0 rounded-xl bg-emerald-800 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-900">Pasang</button>
      <button type="button" onClick={dismiss} aria-label="Tutup" className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"><X className="size-4" /></button>
    </aside>
  );
}
