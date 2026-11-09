"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Search } from "lucide-react";
import { CATALOG_PRODUCTS, formatHarvestDate, type CatalogCategory } from "@/lib/catalog-data";

const CATEGORIES: Array<CatalogCategory | "Semua"> = ["Semua", "Sayur", "Bumbu", "Buah"];
const SORTS = [
  { id: "stok", label: "Stok terbanyak" },
  { id: "panen", label: "Panen terdekat" },
  { id: "nama", label: "Nama A-Z" },
] as const;

export function CatalogBrowser() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("Semua");
  const [sort, setSort] = useState<(typeof SORTS)[number]["id"]>("stok");

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = CATALOG_PRODUCTS.filter((product) => {
      const matchesCategory = category === "Semua" || product.category === category;
      const matchesQuery =
        q.length === 0 ||
        product.name.toLowerCase().includes(q) ||
        product.supplier.toLowerCase().includes(q) ||
        product.regency.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });

    list = [...list].sort((a, b) => {
      if (sort === "stok") return b.availableKg - a.availableKg;
      if (sort === "nama") return a.name.localeCompare(b.name);
      return a.harvestDate.localeCompare(b.harvestDate);
    });

    return list;
  }, [query, category, sort]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari produk, pemasok, atau wilayah"
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-700 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as (typeof SORTS)[number]["id"])}
          className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 outline-none focus:border-emerald-600"
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              category === item ? "bg-emerald-800 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:text-emerald-800"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {products.length === 0 && (
        <p className="mt-10 rounded-2xl border border-dashed border-zinc-200 bg-white py-12 text-center text-sm text-zinc-500">
          Tidak ada produk yang cocok. Coba kata kunci atau kategori lain.
        </p>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <Link key={product.id} href={`/buyer/products/${product.id}`} className="group overflow-hidden rounded-2xl border border-emerald-950/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
            <div className="relative h-40 overflow-hidden bg-emerald-100">
              <Image src={product.image} alt={product.imageAlt} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 1024px) 50vw, 25vw" />
              <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-emerald-800">Grade {product.grade}</span>
              <span className="absolute right-3 top-3 rounded-full bg-emerald-950/80 px-2.5 py-1 text-[11px] font-bold text-white">{product.category}</span>
            </div>
            <div className="p-4">
              <p className="text-lg font-extrabold text-emerald-950">{product.name}</p>
              <p className="mt-1 text-sm text-zinc-500">{product.supplier}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-zinc-400"><MapPin className="size-3.5" /> {product.regency} · Panen {formatHarvestDate(product.harvestDate)}</p>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-sm font-bold text-emerald-700">{product.availableKg} kg tersedia</span>
                <span className="text-xs font-semibold text-emerald-800 group-hover:underline">Lihat detail</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
