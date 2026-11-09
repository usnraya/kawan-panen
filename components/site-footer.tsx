import Image from "next/image";
import Link from "next/link";
import { SimulationBanner } from "@/components/simulation-banner";

export function SiteFooter() {
  return (
    <footer className="border-t border-emerald-950/10 bg-emerald-950 text-emerald-100">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <div className="inline-flex rounded-2xl bg-white px-4 py-2">
            <Image src="/kawan-panen-logo.png" alt="Kawan Panen" width={1206} height={489} className="h-14 w-auto object-contain sm:h-16" />
          </div>
          <p className="mt-4 max-w-sm text-sm leading-6 text-emerald-200">
           Platform Integrasi Rantai Pasok Pertanian: Pemasaran dan Distribusi Hasil Tani Lokal dengan Harga yang Ditentukan Petani 
          </p>
        </div>
        <div>
          <p className="text-sm font-bold text-white">Jelajahi</p>
          <ul className="mt-3 space-y-2 text-sm text-emerald-200">
            <li><Link href="/buyer/availability" className="hover:text-white">Ketersediaan panen</Link></li>
            <li><Link href="/farmer/forecasts" className="hover:text-white">Untuk petani</Link></li>
            <li><Link href="/coordinator/dashboard" className="hover:text-white">Koordinasi pasokan</Link></li>
            <li><Link href="/coordinator/hub" className="hover:text-white">Verifikasi &amp; QC hub</Link></li>
            <li><Link href="/coordinator/disputes" className="hover:text-white">Komplain &amp; refund</Link></li>
            <li><Link href="/coordinator/demo" className="hover:text-white">Ruang demo</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-bold text-white">Akun</p>
          <ul className="mt-3 space-y-2 text-sm text-emerald-200">
            <li><Link href="/login" className="hover:text-white">Masuk</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-4 py-5 text-center text-xs text-emerald-300 sm:px-6 lg:px-8">
        © 2026 Kawan Panen. Semua hak dilindungi.
      </div>
      <SimulationBanner />
    </footer>
  );
}
