import Link from "next/link";
import { LogOut } from "lucide-react";
import { getCurrentProfile, ROLE_HOME } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

/**
 * Server component: reads the auth cookie, so it must stay behind a <Suspense>
 * boundary in site-header.tsx — it is the only dynamic part of the header.
 */
export async function AccountStatus() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return (
      <Link href="/login" className="ml-1 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-900">
        Masuk
      </Link>
    );
  }

  const label = profile.org_name || profile.display_name;

  return (
    <div className="ml-1 flex items-center gap-1.5">
      <Link
        href={ROLE_HOME[profile.role]}
        className="flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900 transition hover:bg-emerald-200"
      >
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-xs font-extrabold text-white">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden max-w-32 truncate sm:inline">{label}</span>
      </Link>
      <form action={signOut}>
        <button type="submit" aria-label="Keluar" className="rounded-xl p-2.5 text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-800">
          <LogOut className="size-5" />
        </button>
      </form>
    </div>
  );
}
