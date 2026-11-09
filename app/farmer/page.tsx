import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardList, LineChart, ShieldCheck, Sprout, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CATALOG_PRODUCTS, formatHarvestDate } from "@/lib/catalog-data";

const benefits = [
  {
    icon: ClipboardList,
    title: "Catat prakiraan panen",
    text: "Masukkan komoditas, estimasi jumlah, grade, dan tanggal panen dalam satu tempat.",
  },
  {
    icon: Users,
    title: "Lebih mudah ditemukan pembeli",
    text: "Data panen tampil sebagai pasokan yang bisa dipertimbangkan hotel, restoran, dan katering.",
  },
  {
    icon: LineChart,
    title: "Pantau serapan",
    text: "Lihat berapa kilogram yang sudah dialokasikan dan berapa yang masih tersedia.",
  },
];

const steps = [
  ["01", "Buat prakiraan", "Pilih komoditas, masukkan estimasi hasil, tanggal panen, dan grade."],
  ["02", "Tinjau kebutuhan", "Permintaan pembeli dipasangkan dengan pasokan yang sesuai secara terukur."],
  ["03", "Siapkan pasokan", "Pantau status alokasi agar jumlah panen dan kebutuhan pembeli lebih selaras."],
];

export default function FarmerLandingPage() {
  const featured = CATALOG_PRODUCTS.find((product) => product.category === "Sayur") ?? CATALOG_PRODUCTS[0];

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-emerald-950/10 bg-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:px-8 lg:py-16">
            <div>
              <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><Sprout className="size-4" /> Ruang untuk petani</p>
              <h1 className="mt-4 max-w-2xl text-4xl font-extrabold leading-tight tracking-tight text-emerald-950 sm:text-5xl">Panenmu lebih siap ditawarkan.</h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-zinc-600 sm:text-lg">Kawan Panen membantu petani mencatat pasokan, melihat kebutuhan pembeli, dan menjaga informasi panen tetap jelas sejak awal.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-emerald-800 px-5 font-bold text-white transition hover:bg-emerald-900">Masuk ke ruang petani <ArrowRight className="size-4" /></Link>
                <Link href="/buyer/availability" className="inline-flex h-12 items-center rounded-xl border border-emerald-800 px-5 font-bold text-emerald-800 transition hover:bg-emerald-50">Lihat katalog pembeli</Link>
              </div>
              <div className="mt-8 grid gap-3 text-sm font-semibold text-zinc-600 sm:grid-cols-3">
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Data panen rapi</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Status mudah dipantau</span>
                <span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-emerald-700" /> Tanpa biaya di demo</span>
              </div>
            </div>
            <div className="relative min-h-[380px] overflow-hidden rounded-[2rem] bg-emerald-950 shadow-xl shadow-emerald-950/15 sm:min-h-[460px]">
              <Image src={featured.image} alt={featured.imageAlt} fill priority className="object-cover opacity-75" sizes="(max-width: 1024px) 100vw, 45vw" />
              <div className="absolute inset-0 bg-gradient-to-t from-emerald-950 via-emerald-950/30 to-transparent" />
              <div className="relative flex min-h-[380px] flex-col justify-between p-6 text-white sm:min-h-[460px] sm:p-8">
                <div className="flex items-center justify-between"><span className="rounded-full bg-lime-400 px-3 py-1.5 text-xs font-extrabold text-emerald-950">Contoh pasokan</span><span className="rounded-full bg-black/25 px-3 py-1.5 text-xs font-bold backdrop-blur">Grade {featured.grade}</span></div>
                <div><p className="text-sm font-semibold text-lime-300">Data yang dilihat pembeli</p><h2 className="mt-2 text-3xl font-extrabold">{featured.name}</h2><p className="mt-3 text-sm leading-6 text-emerald-100">{featured.availableKg} kg tersedia · Panen {formatHarvestDate(featured.harvestDate)}</p><div className="mt-5 flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="size-4 text-lime-300" /> Informasi pasokan lebih transparan</div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="max-w-2xl"><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Manfaat untuk petani</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight text-emerald-950">Satu ruang untuk mengelola pasokan.</h2><p className="mt-3 text-zinc-600">Bukan sekadar mencatat hasil panen. Informasi yang lengkap membantu pembeli memahami kapan dan berapa banyak pasokan yang tersedia.</p></div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">{benefits.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-emerald-950/10 bg-white p-6 shadow-sm"><div className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-800"><Icon className="size-5" /></div><h3 className="mt-5 text-lg font-extrabold text-emerald-950">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{text}</p></div>)}</div>
        </section>

        <section className="border-y border-emerald-950/10 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Cara kerja</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight text-emerald-950">Dari kebun ke permintaan pembeli.</h2><p className="mt-4 text-zinc-600">Alurnya dibuat sederhana agar petani dapat fokus pada pasokan, bukan pekerjaan administrasi yang berulang.</p></div><div className="grid gap-4">{steps.map(([number, title, text]) => <div key={number} className="flex gap-4 rounded-2xl border border-emerald-950/10 bg-[#f7faf7] p-5"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-800 text-sm font-extrabold text-white">{number}</span><div><h3 className="font-extrabold text-emerald-950">{title}</h3><p className="mt-1 text-sm leading-6 text-zinc-600">{text}</p></div></div>)}</div></div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16"><div className="rounded-3xl bg-emerald-950 px-6 py-10 text-white sm:px-10"><div className="flex flex-col justify-between gap-8 md:flex-row md:items-center"><div><div className="flex items-center gap-2 text-sm font-bold text-lime-300"><CalendarDays className="size-4" /> Siapkan data panenmu</div><h2 className="mt-3 text-2xl font-extrabold sm:text-3xl">Mulai dari prakiraan panen berikutnya.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-emerald-200">Masuk untuk melihat dashboard petani dan menambahkan komoditas yang siap kamu tawarkan.</p></div><Link href="/login" className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-lime-400 px-5 font-bold text-emerald-950 hover:bg-lime-300">Masuk sebagai petani <ArrowRight className="size-4" /></Link></div></div></section>
      </main>
      <SiteFooter />
    </div>
  );
}
