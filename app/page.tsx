import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ChevronRight, Leaf, ShieldCheck, Sparkles, Truck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATALOG_PRODUCTS } from "@/lib/catalog-data";

const roles = [
  { icon: Leaf, title: "Petani", text: "Catat prakiraan panen dan dapatkan kepastian serapan." },
  { icon: Truck, title: "Pembeli", text: "Temukan hasil panen sesuai kebutuhan dan jadwal." },
  { icon: ShieldCheck, title: "Pasokan terjaga", text: "Alokasi cadangan siap saat pasokan utama berubah." },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:pb-16 lg:pt-12">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><Sparkles className="size-3.5" /> Panen segar dari sumber terpercaya</div>
            <h1 className="max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-emerald-950 sm:text-5xl lg:text-6xl">Segarnya sampai ke meja makanmu.</h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-zinc-600 sm:text-lg">Temukan hasil panen berkualitas dari petani lokal. Ketersediaan jelas, pasokan terencana, dan hubungan yang tumbuh bersama.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/buyer/availability" className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-800 px-5 font-bold text-white transition hover:bg-emerald-900">Belanja hasil panen <ArrowRight className="size-4" /></Link>
              <Link href="/farmer/forecasts" className="inline-flex h-12 items-center rounded-xl border border-emerald-800 px-5 font-bold text-emerald-800 transition hover:bg-emerald-50">Saya petani</Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-zinc-600"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Pasokan terukur</span><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Petani terhubung</span></div>
          </div>
          <div className="relative min-h-[360px] overflow-hidden rounded-[2rem] bg-emerald-950 p-6 shadow-xl shadow-emerald-950/15 sm:min-h-[420px]">
            <Image src={CATALOG_PRODUCTS[0].image} alt={CATALOG_PRODUCTS[0].imageAlt} fill priority className="object-cover opacity-75" sizes="(max-width: 1024px) 100vw, 45vw" />
            <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/20 to-emerald-950/10" />
            <div className="relative flex h-full min-h-[320px] flex-col justify-between text-white sm:min-h-[380px]">
              <div className="flex items-start justify-between"><span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-emerald-900">Pilihan minggu ini</span><span className="rounded-full bg-black/20 px-3 py-1.5 text-xs font-semibold backdrop-blur">Grade A</span></div>
              <div><p className="text-sm font-semibold text-lime-300">Dari Bangli · Panen 12 Nov 2026</p><h2 className="mt-2 text-3xl font-extrabold">{CATALOG_PRODUCTS[0].name}</h2><p className="mt-2 text-sm text-emerald-100">{CATALOG_PRODUCTS[0].availableKg} kg tersedia · {CATALOG_PRODUCTS[0].supplier}</p></div>
            </div>
          </div>
        </section>

        <section className="border-y border-emerald-950/10 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Katalog panen</p><h2 className="mt-2 text-2xl font-extrabold text-emerald-950 sm:text-3xl">Yang sedang tersedia</h2></div><Link href="/buyer/availability" className="flex items-center gap-1 text-sm font-bold text-emerald-800 hover:underline">Lihat semua <ChevronRight className="size-4" /></Link></div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {CATALOG_PRODUCTS.map((product) => (
                <Link key={product.id} href={`/buyer/products/${product.id}`} className="group overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                  <div className="relative h-44 overflow-hidden bg-emerald-100"><Image src={product.image} alt={product.imageAlt} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 1024px) 50vw, 25vw" /><span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-emerald-800">{product.grade} · Tersedia</span></div>
                  <div className="p-4"><p className="text-lg font-extrabold text-emerald-950">{product.name}</p><p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">{product.description}</p><div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3"><span className="text-sm font-bold text-emerald-700">{product.availableKg} kg</span><span className="text-xs font-semibold text-zinc-500">{product.regency}</span></div></div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-4 px-4 py-12 sm:px-6 sm:grid-cols-3 lg:px-8 lg:py-16">{roles.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md"><div className="mb-5 grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="size-5" /></div><h2 className="text-lg font-bold text-emerald-950">{title}</h2><p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p></div>)}</section>
        <section className="bg-emerald-950 text-white"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:px-8"><div><h2 className="text-2xl font-extrabold">Siap tumbuh bersama?</h2><p className="mt-2 text-emerald-200">Mulai dari data panen yang kamu punya hari ini.</p></div><Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-lime-400 px-5 font-bold text-emerald-950 hover:bg-lime-300">Mulai sekarang <ArrowRight className="size-4" /></Link></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
