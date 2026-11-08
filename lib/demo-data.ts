import type { Database } from "@/lib/database.types";

export type DemoProfile = {
  id: string;
  role: Database["public"]["Enums"]["user_role"];
  display_name: string;
  org_name: string | null;
  regency: string;
};

export const DEMO_PROFILES: Record<DemoProfile["role"], DemoProfile> = {
  farmer: {
    id: "demo-farmer",
    role: "farmer",
    display_name: "Kelompok Tani Sejahtera",
    org_name: "Kelompok Tani Sejahtera",
    regency: "Bangli",
  },
  buyer: {
    id: "demo-buyer",
    role: "buyer",
    display_name: "Tim Pengadaan",
    org_name: "Mitra Kuliner Bali",
    regency: "Badung",
  },
  coordinator: {
    id: "demo-coordinator",
    role: "coordinator",
    display_name: "Ruang Koordinasi",
    org_name: "Kawan Panen",
    regency: "Denpasar",
  },
};

export const DEMO_COMMODITIES: Database["public"]["Tables"]["commodities"]["Row"][] = [
  { id: "tomato", name: "Tomat", shelf_life_days: 7 },
  { id: "mustard-green", name: "Sawi", shelf_life_days: 5 },
  { id: "cabbage", name: "Kubis", shelf_life_days: 10 },
];

export type DemoAvailabilityRow = {
  commodity_id: string;
  commodity_name: string;
  week_start: string;
  available_kg: number;
  forecast_count: number;
};

export const DEMO_AVAILABILITY: DemoAvailabilityRow[] = [
  {
    commodity_id: "tomato",
    commodity_name: "Tomat",
    week_start: "2026-11-09",
    available_kg: 480,
    forecast_count: 4,
  },
  {
    commodity_id: "mustard-green",
    commodity_name: "Sawi",
    week_start: "2026-11-09",
    available_kg: 220,
    forecast_count: 3,
  },
  {
    commodity_id: "cabbage",
    commodity_name: "Kubis",
    week_start: "2026-11-16",
    available_kg: 760,
    forecast_count: 5,
  },
  {
    commodity_id: "tomato",
    commodity_name: "Tomat",
    week_start: "2026-11-16",
    available_kg: 315,
    forecast_count: 3,
  },
];

export type DemoForecastRow = {
  id: string;
  est_kg: number;
  reserved_kg: number;
  expected_harvest_date: string;
  grade: "A" | "B" | "C";
  status: "open" | "closed";
  commodities: { name: string } | null;
};

export const DEMO_FORECASTS: DemoForecastRow[] = [
  {
    id: "forecast-tomato-1",
    est_kg: 300,
    reserved_kg: 180,
    expected_harvest_date: "2026-11-12",
    grade: "A",
    status: "open",
    commodities: { name: "Tomat" },
  },
  {
    id: "forecast-mustard-1",
    est_kg: 160,
    reserved_kg: 0,
    expected_harvest_date: "2026-11-14",
    grade: "B",
    status: "open",
    commodities: { name: "Sawi" },
  },
  {
    id: "forecast-cabbage-1",
    est_kg: 420,
    reserved_kg: 420,
    expected_harvest_date: "2026-11-18",
    grade: "A",
    status: "closed",
    commodities: { name: "Kubis" },
  },
];
