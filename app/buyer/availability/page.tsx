import { CalendarDays, CheckCircle2, Hotel, MapPin, PackageCheck, ShieldCheck, Sprout } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATALOG_PRODUCTS } from "@/lib/catalog-data";
import { CatalogBrowser } from "./catalog-browser";

export default function BuyerAvailabilityPage() {
  const totalKg = CATALOG_PRODUCTS.reduce((sum, product) => sum + product.availableKg, 0);
  const supplierCount = new Set(CATALOG_PRODUCTS.map((product) => product.supplier)).size;
  const regencyCount = new Set(CATALOG_PRODUCTS.map((product) => product.regency)).size;

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-emerald-950/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-14">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
                <Sprout className="size-4" /> Pasokan segar terjadwal
              </p>
              <h1 className="mt-3 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-emerald-950 sm:text-5xl">
                Belanja hasil panen untuk kebutuhan hotel.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
                Temukan sayur, buah, dan bumbu dari pemasok lokal dengan stok, wilayah, grade, dan jadwal panen yang jelas.
              </p>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-zinc-600">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Grade tercatat</span>
                <span className="flex items-center gap-2"><CalendarDays className="size-4 text-emerald-700" /> Jadwal panen jelas</span>
                <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-700" /> Pemasok terkurasi</span>
              </div>
            </div>
            <div className="rounded-3xl bg-emerald-950 p-6 text-white shadow-xl shadow-emerald-950/10 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-2xl bg-lime-400 text-emerald-950"><Hotel className="size-5" /></span>
                <div><p className="text-sm font-bold text-lime-300">Dibuat untuk operasional</p><p className="font-extrabold">Hotel, restoran, dan katering</p></div>
              </div>
              <p className="mt-6 text-sm leading-6 text-emerald-100">Pilih kebutuhan dapurmu dari pasokan yang tersedia. Ajukan jumlah dan tanggal kirim setelah menemukan produk yang sesuai.</p>
              <div className="mt-7 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
                <div><p className="text-2xl font-extrabold text-white">{totalKg.toLocaleString("id-ID")}</p><p className="mt-1 text-xs text-emerald-300">kg tersedia</p></div>
                <div><p className="text-2xl font-extrabold text-white">{supplierCount}</p><p className="mt-1 text-xs text-emerald-300">pemasok</p></div>
                <div><p className="text-2xl font-extrabold text-white">{regencyCount}</p><p className="mt-1 text-xs text-emerald-300">wilayah</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Katalog pemasok</p>
              <h2 className="mt-2 text-2xl font-extrabold text-emerald-950 sm:text-3xl">Produk segar yang tersedia</h2>
              <p className="mt-2 text-sm text-zinc-500">Pilih produk untuk melihat detail pasokan dan pemasoknya.</p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800"><PackageCheck className="size-4" /> Stok diperbarui per jadwal panen</p>
          </div>
          <CatalogBrowser />
        </section>

        <section className="border-t border-emerald-950/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:grid-cols-3 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-emerald-950/10 bg-[#f7faf7] p-5"><p className="font-bold text-emerald-950">Untuk sarapan & buffet</p><p className="mt-2 text-sm leading-6 text-zinc-600">Buah segar, selada, tomat, dan sayuran harian untuk menu tamu.</p></div>
            <div className="rounded-2xl border border-emerald-950/10 bg-[#f7faf7] p-5"><p className="font-bold text-emerald-950">Untuk dapur restoran</p><p className="mt-2 text-sm leading-6 text-zinc-600">Bumbu dasar, sayur, dan bahan segar dengan jumlah yang mudah diajukan.</p></div>
            <div className="rounded-2xl border border-emerald-950/10 bg-[#f7faf7] p-5"><p className="font-bold text-emerald-950">Untuk juice bar</p><p className="mt-2 flex items-start gap-2 text-sm leading-6 text-zinc-600"><MapPin className="mt-1 size-4 shrink-0 text-emerald-700" /> Buah pilihan dari beberapa wilayah pemasok Bali.</p></div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
