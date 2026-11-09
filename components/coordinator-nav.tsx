import Link from "next/link";

const links = [
  ["Dasbor", "/coordinator/dashboard"],
  ["Hub & QC", "/coordinator/hub"],
  ["Komplain", "/coordinator/disputes"],
  ["Ruang demo", "/coordinator/demo"],
] as const;

export function CoordinatorNav({ current }: { current: string }) {
  return (
    <nav aria-label="Navigasi koordinator" className="mb-6 flex flex-wrap gap-2">
      {links.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={current === href ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${current === href ? "bg-emerald-800 text-white" : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
