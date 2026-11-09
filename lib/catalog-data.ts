export type CatalogCategory = "Sayur" | "Buah" | "Bumbu";

/** Formats a catalog ISO date (YYYY-MM-DD) for Indonesian display, e.g. "12 Nov 2026". */
export function isCatalogDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function formatHarvestDate(iso: string) {
  if (!isCatalogDate(iso)) throw new Error(`Invalid catalog date: ${iso}`);
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** Simulated wholesale minimum for the M7 cart/checkout flow. Shared by client and server code. */
export const MIN_ORDER_KG = 20;
export const ORDER_STEP_KG = 5;

export type CatalogProduct = {
  id: string;
  name: string;
  /** Matches a row in the `commodities` table (see supabase/seed.sql) for request/matching. */
  commodityName: string;
  category: CatalogCategory;
  description: string;
  supplier: string;
  regency: string;
  availableKg: number;
  harvestDate: string;
  grade: "A" | "B";
  image: string;
  imageAlt: string;
  /** Simulated price in IDR per kg, used by the M7 cart/checkout flow only. */
  pricePerKg: number;
};

// Catalog content for the assignment demo. Supplier names, logistics data, and prices are fictional.
export const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: "tomat-premium",
    name: "Tomat Segar Premium",
    commodityName: "Tomat",
    category: "Sayur",
    description: "Tomat merah pilihan, cocok untuk dapur hotel dan restoran dengan kebutuhan harian besar.",
    supplier: "Kelompok Tani Sejahtera",
    regency: "Bangli",
    availableKg: 300,
    harvestDate: "2026-11-12",
    grade: "A",
    image: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Tomat merah segar dalam keranjang",
    pricePerKg: 12000,
  },
  {
    id: "sawi-hijau",
    name: "Sawi Hijau",
    commodityName: "Sawi",
    category: "Sayur",
    description: "Daun hijau renyah dengan panen terjadwal, cocok untuk menu tumisan dapur hotel.",
    supplier: "Kebun Pagi Bali",
    regency: "Tabanan",
    availableKg: 220,
    harvestDate: "2026-11-14",
    grade: "A",
    image: "/catalog/sawi-hijau.jpg",
    imageAlt: "Sawi hijau segar dalam keranjang",
    pricePerKg: 8000,
  },
  {
    id: "kubis-segar",
    name: "Kubis Segar",
    commodityName: "Kubis",
    category: "Sayur",
    description: "Kubis padat dan segar untuk kebutuhan katering, buffet, dan rumah tangga.",
    supplier: "Tani Mandiri",
    regency: "Bangli",
    availableKg: 420,
    harvestDate: "2026-11-18",
    grade: "A",
    image: "https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Kubis hijau segar",
    pricePerKg: 6000,
  },
  {
    id: "tomat-konsumsi",
    name: "Tomat Ukuran Campur",
    commodityName: "Tomat",
    category: "Sayur",
    description: "Pasokan tomat harian dengan kualitas konsisten dan jumlah fleksibel untuk dapur restoran.",
    supplier: "Ladang Bersama",
    regency: "Gianyar",
    availableKg: 180,
    harvestDate: "2026-11-20",
    grade: "B",
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Tomat segar merah di permukaan kayu",
    pricePerKg: 9000,
  },
  {
    id: "wortel-kintamani",
    name: "Wortel Kintamani",
    commodityName: "Wortel",
    category: "Sayur",
    description: "Wortel dataran tinggi, renyah dan manis, cocok untuk sup dan garnish hotel.",
    supplier: "Kelompok Tani Kintamani",
    regency: "Bangli",
    availableKg: 260,
    harvestDate: "2026-11-13",
    grade: "A",
    image: "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Wortel segar dengan daunnya",
    pricePerKg: 7000,
  },
  {
    id: "terong-ungu",
    name: "Terong Ungu",
    commodityName: "Terong",
    category: "Sayur",
    description: "Terong ungu segar untuk menu grill dan masakan rumahan dapur restoran.",
    supplier: "Tani Makmur Jaya",
    regency: "Tabanan",
    availableKg: 150,
    harvestDate: "2026-11-15",
    grade: "A",
    image: "/catalog/terong-ungu.jpg",
    imageAlt: "Terong ungu segar",
    pricePerKg: 8500,
  },
  {
    id: "selada-hidroponik",
    name: "Selada Keriting Hidroponik",
    commodityName: "Selada",
    category: "Sayur",
    description: "Selada hidroponik bersih, siap pakai untuk salad bar dan buffet sarapan hotel.",
    supplier: "Kebun Hidro Baturiti",
    regency: "Tabanan",
    availableKg: 110,
    harvestDate: "2026-11-11",
    grade: "A",
    image: "https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Selada keriting hijau segar",
    pricePerKg: 18000,
  },
  {
    id: "timun-segar",
    name: "Timun Segar",
    commodityName: "Timun",
    category: "Sayur",
    description: "Timun segar untuk infused water, salad, dan pelengkap menu dapur hotel.",
    supplier: "Kebun Segar Pupuan",
    regency: "Tabanan",
    availableKg: 200,
    harvestDate: "2026-11-16",
    grade: "B",
    image: "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Timun segar dipotong dan utuh",
    pricePerKg: 6500,
  },
  {
    id: "cabai-merah-keriting",
    name: "Cabai Merah Keriting",
    commodityName: "Cabai Merah",
    category: "Bumbu",
    description: "Cabai merah keriting pedas pas, stok rutin untuk dapur restoran dan sambal hotel.",
    supplier: "Tani Jaya Abadi",
    regency: "Karangasem",
    availableKg: 95,
    harvestDate: "2026-11-12",
    grade: "A",
    image: "https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Cabai merah segar",
    pricePerKg: 45000,
  },
  {
    id: "bawang-merah",
    name: "Bawang Merah Super",
    commodityName: "Bawang Merah",
    category: "Bumbu",
    description: "Bawang merah lokal kualitas super, bumbu dasar wajib dapur hotel dan restoran.",
    supplier: "Kelompok Tani Bersatu",
    regency: "Bangli",
    availableKg: 140,
    harvestDate: "2026-11-17",
    grade: "A",
    image: "https://images.unsplash.com/photo-1508747703725-719777637510?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Bawang merah segar",
    pricePerKg: 32000,
  },
  {
    id: "bawang-putih",
    name: "Bawang Putih Lokal",
    commodityName: "Bawang Putih",
    category: "Bumbu",
    description: "Bawang putih lokal untuk kebutuhan bumbu dasar harian dapur hotel.",
    supplier: "Tani Sumber Rejeki",
    regency: "Karangasem",
    availableKg: 120,
    harvestDate: "2026-11-19",
    grade: "B",
    image: "https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Bawang putih segar",
    pricePerKg: 38000,
  },
  {
    id: "jahe-merah",
    name: "Jahe Merah",
    commodityName: "Jahe Merah",
    category: "Bumbu",
    description: "Jahe merah segar untuk minuman hangat, jamu, dan bumbu dapur hotel.",
    supplier: "Kebun Rempah Munduk",
    regency: "Buleleng",
    availableKg: 70,
    harvestDate: "2026-11-21",
    grade: "A",
    image: "/catalog/jahe-merah.jpg",
    imageAlt: "Jahe merah segar",
    pricePerKg: 25000,
  },
  {
    id: "pisang-raja",
    name: "Pisang Raja",
    commodityName: "Pisang",
    category: "Buah",
    description: "Pisang raja manis, favorit untuk buffet sarapan dan dessert hotel.",
    supplier: "Kelompok Tani Raja Buah",
    regency: "Jembrana",
    availableKg: 260,
    harvestDate: "2026-11-14",
    grade: "A",
    image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Pisang raja matang",
    pricePerKg: 9000,
  },
  {
    id: "mangga-harum-manis",
    name: "Mangga Harum Manis",
    commodityName: "Mangga",
    category: "Buah",
    description: "Mangga harum manis pilihan untuk juice bar dan sarapan tamu hotel.",
    supplier: "Kebun Mangga Negara",
    regency: "Jembrana",
    availableKg: 190,
    harvestDate: "2026-11-22",
    grade: "A",
    image: "https://images.unsplash.com/photo-1605027990121-cbae9e0642df?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Mangga harum manis segar",
    pricePerKg: 14000,
  },
  {
    id: "alpukat-mentega",
    name: "Alpukat Mentega",
    commodityName: "Alpukat",
    category: "Buah",
    description: "Alpukat mentega tekstur lembut, cocok untuk jus dan menu sarapan hotel.",
    supplier: "Tani Dataran Tinggi",
    regency: "Bangli",
    availableKg: 130,
    harvestDate: "2026-11-20",
    grade: "A",
    image: "https://images.unsplash.com/photo-1601039641847-7857b994d704?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Alpukat mentega belah dua",
    pricePerKg: 20000,
  },
  {
    id: "jeruk-kintamani",
    name: "Jeruk Kintamani",
    commodityName: "Jeruk",
    category: "Buah",
    description: "Jeruk khas dataran tinggi Kintamani, segar untuk welcome drink dan juice bar hotel.",
    supplier: "Koperasi Jeruk Kintamani",
    regency: "Bangli",
    availableKg: 310,
    harvestDate: "2026-11-15",
    grade: "A",
    image: "https://images.unsplash.com/photo-1557800636-894a64c1696f?auto=format&fit=crop&w=900&q=85",
    imageAlt: "Jeruk segar dalam keranjang",
    pricePerKg: 11000,
  },
];
