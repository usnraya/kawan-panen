import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CalendarDays, CheckCircle2, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { CATALOG_PRODUCTS } from "@/lib/catalog-data";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getCartCount } from "@/lib/commerce";
import { AddToCart } from "./add-to-cart";

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const instant = false;

type ProductPageProps = { params: Promise<{ id: string }> };

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = CATALOG_PRODUCTS.find((item) => item.id === id);
  if (!product) notFound();

  const commodityId = hasSupabaseEnv()
    ? (await (await createClient()).from("commodities").select("id").eq("name", product.commodityName).maybeSingle()).data?.id ?? null
    : null;
  const requestHref = commodityId ? `/buyer/requests/new?commodity=${commodityId}` : "/login";
  const cartCount = await getCartCount();

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader cartCount={cartCount} />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link href="/buyer/availability" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800 hover:underline"><ArrowLeft className="size-4" /> Kembali ke katalog</Link>
        <div className="mt-7 grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="relative min-h-[360px] overflow-hidden rounded-3xl bg-emerald-100 sm:min-h-[500px]">
            <Image src={product.image} alt={product.imageAlt} fill priority className="object-cover" sizes="(max-width: 1024px) 100vw, 55vw" />
          </div>
          <div className="rounded-3xl border border-emerald-950/10 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex items-center justify-between gap-4"><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800">Grade {product.grade}</span><span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700"><CheckCircle2 className="size-4" /> Dalam katalog</span></div>
            <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-emerald-950">{product.name}</h1>
            <p className="mt-4 text-base leading-7 text-zinc-600">{product.description}</p>
            <div className="mt-7 grid gap-3 border-y border-zinc-100 py-5 text-sm"><p className="flex items-center gap-3 text-zinc-700"><PackageCheck className="size-5 text-emerald-700" /><span><strong className="text-emerald-950">{product.availableKg} kg</strong> indikasi katalog</span></p><p className="flex items-center gap-3 text-zinc-700"><CalendarDays className="size-5 text-emerald-700" /><span>Perkiraan panen <strong className="text-emerald-950">{product.harvestDate}</strong></span></p><p className="flex items-center gap-3 text-zinc-700"><MapPin className="size-5 text-emerald-700" /><span>Asal panen <strong className="text-emerald-950">{product.regency}</strong></span></p></div>
            <div className="mt-6 rounded-2xl bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Pemasok</p><p className="mt-1 font-bold text-emerald-950">{product.supplier}</p><p className="mt-1 text-sm text-emerald-800">Pemasok aktif di jaringan Kawan Panen</p></div>
            <p className="mt-6 text-2xl font-extrabold text-emerald-950">{currency.format(product.pricePerKg)} <span className="text-sm font-semibold text-zinc-500">/ kg</span></p>
            <div className="mt-4"><AddToCart productId={product.id} availableKg={product.availableKg} /></div>
            <Link href={requestHref} className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-800 font-bold text-emerald-800 transition hover:bg-emerald-50"><ShieldCheck className="size-4" /> Ajukan kebutuhan borongan</Link>
            <p className="mt-3 text-center text-xs text-zinc-500">Jumlah di atas adalah indikasi katalog, bukan stok terverifikasi. Stok terverifikasi untuk jumlah pesananmu akan dicek otomatis di halaman keranjang sebelum pembayaran.</p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
