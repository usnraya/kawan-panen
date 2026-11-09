"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Heart, ShoppingCart } from "lucide-react";

const navItems = [
  { href: "/", label: "Home", matches: (pathname: string) => pathname === "/" },
  { href: "/buyer/availability", label: "Produk segar", matches: (pathname: string) => pathname.startsWith("/buyer") },
  { href: "/farmer", label: "Untuk petani", matches: (pathname: string) => pathname.startsWith("/farmer") },
];

export function SiteHeaderClient({ cartCount, account }: { cartCount: number; account: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-emerald-950/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-5 px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Kawan Panen beranda">
          <Image
            src="/kawan-panen-logo.png"
            alt="Kawan Panen"
            width={1206}
            height={489}
            priority
            className="h-10 w-auto object-contain sm:h-11"
          />
        </Link>
        <nav className="hidden items-center gap-1 text-sm font-semibold text-zinc-600 md:flex">
          {navItems.map((item) => {
            const active = item.matches(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 ${active ? "bg-emerald-50 text-emerald-800" : "hover:bg-emerald-50 hover:text-emerald-800"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <Link href="/buyer/availability" aria-label="Daftar keinginan" className="hidden rounded-xl p-2.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-800 sm:block"><Heart className="size-5" /></Link>
          <Link
            href="/buyer/cart"
            aria-label={cartCount > 0 ? `Keranjang, ${cartCount} produk` : "Keranjang"}
            className="relative rounded-xl p-2.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <ShoppingCart className="size-5" />
            {cartCount > 0 && (
              <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-extrabold leading-5 text-white shadow-sm">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </Link>
          {account}
        </div>
      </div>
    </header>
  );
}
