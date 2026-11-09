import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const password = "Simulasi-Aman-123!";
const farmerUsers = [
  ["petani.simulasi@example.test", "Kelompok Tani Sejahtera", "Bangli"],
  ["petani.pagi@example.test", "Kebun Pagi Bali", "Tabanan"],
  ["petani.mandiri@example.test", "Tani Mandiri", "Bangli"],
  ["petani.bersama@example.test", "Ladang Bersama", "Gianyar"],
  ["petani.kintamani@example.test", "Kelompok Tani Kintamani", "Bangli"],
  ["petani.makmur@example.test", "Tani Makmur Jaya", "Tabanan"],
  ["petani.munduk@example.test", "Kebun Rempah Munduk", "Buleleng"],
  ["petani.raja-buah@example.test", "Kelompok Tani Raja Buah", "Jembrana"],
].map(([email, org_name, regency]) => ({
  email,
  password,
  role: "farmer",
  display_name: org_name,
  org_name,
  regency,
  wa_number: "620000000000",
}));

const users = [
  ...farmerUsers,
  {
    email: "pembeli.simulasi@example.test",
    password,
    role: "buyer",
    display_name: "Pengelola Hotel Contoh A",
    org_name: "Hotel Contoh A",
    regency: "Badung",
    wa_number: "620000000000",
  },
  {
    email: "koordinator.simulasi@example.test",
    password,
    role: "coordinator",
    display_name: "Koordinator Demo A",
    org_name: "Kawan Panen",
    regency: "Denpasar",
    wa_number: "620000000000",
  },
];

const commodityRows = [
  ["Tomat", 7], ["Sawi", 5], ["Kubis", 14], ["Wortel", 21],
  ["Terong", 7], ["Selada", 5], ["Timun", 7], ["Cabai Merah", 10],
  ["Bawang Merah", 60], ["Bawang Putih", 90], ["Jahe Merah", 90],
  ["Pisang", 7], ["Mangga", 10], ["Alpukat", 7], ["Jeruk", 14],
].map(([name, shelf_life_days]) => ({ name, shelf_life_days }));

// Production cost / asking price per kg (Rupiah, integer). Every price clears
// the Pergub 99/2018 floor (cost x 1.2, lib/finance.ts validatePriceFloor) so
// seeded listings verify cleanly in the demo instead of tripping the guard.
const PRICE_BY_COMMODITY = {
  Tomat: [6_000, 9_000],
  Sawi: [4_000, 6_000],
  Kubis: [3_000, 4_500],
  Wortel: [3_500, 5_200],
  Terong: [4_000, 6_000],
  Selada: [3_500, 5_500],
  Timun: [3_000, 4_500],
  "Cabai Merah": [12_000, 18_000],
  "Bawang Merah": [15_000, 22_000],
  "Bawang Putih": [20_000, 28_000],
  "Jahe Merah": [10_000, 15_000],
  Pisang: [4_000, 6_000],
  Mangga: [6_000, 9_000],
  Alpukat: [7_000, 10_500],
  Jeruk: [5_000, 7_500],
};

const HUB_ROWS = [
  { name: "Hub Tabanan", regency: "Tabanan", is_active: true },
  { name: "Titik Kumpul Karangasem", regency: "Karangasem", is_active: true },
];

async function seedHubs() {
  const { data: existing, error: readError } = await supabase.from("hubs").select("id, name");
  if (readError) throw readError;
  const existingNames = new Set((existing ?? []).map((row) => row.name));
  const missing = HUB_ROWS.filter((hub) => !existingNames.has(hub.name));
  if (missing.length > 0) {
    const { error } = await supabase.from("hubs").insert(missing);
    if (error) throw error;
  }
  const { data: hubs, error: hubError } = await supabase.from("hubs").select("id, name");
  if (hubError) throw hubError;
  return new Map(hubs.map((hub) => [hub.name, hub.id]));
}

async function seedReferenceData() {
  const { error: commodityError } = await supabase
    .from("commodities")
    .upsert(commodityRows, { onConflict: "name" });
  if (commodityError) throw commodityError;

  const distances = [
    ["Bangli", "Denpasar", 45], ["Denpasar", "Bangli", 45],
    ["Bangli", "Badung", 55], ["Badung", "Bangli", 55],
    ["Tabanan", "Denpasar", 30], ["Denpasar", "Tabanan", 30],
    ["Tabanan", "Badung", 40], ["Badung", "Tabanan", 40],
    ["Gianyar", "Denpasar", 25], ["Denpasar", "Gianyar", 25],
    ["Gianyar", "Badung", 35], ["Badung", "Gianyar", 35],
    ["Karangasem", "Denpasar", 70], ["Denpasar", "Karangasem", 70],
    ["Buleleng", "Denpasar", 85], ["Denpasar", "Buleleng", 85],
    ["Jembrana", "Denpasar", 90], ["Denpasar", "Jembrana", 90],
  ].map(([from_regency, to_regency, km]) => ({ from_regency, to_regency, km }));

  const { error: distanceError } = await supabase
    .from("zone_distance")
    .upsert(distances, { onConflict: "from_regency,to_regency" });
  if (distanceError) throw distanceError;
}

// Every open commodity below has >=2 farmers so the 50%-per-supplier matching
// cap (settings.matching.maxSharePerSupplier) never leaves a solo-supplier
// commodity permanently half-stocked for a minimum-size (20kg) buyer order.
const FORECAST_SETS = [
  [["Tomat", 300, 180, "2026-11-12", "A", "open"], ["Sawi", 220, 70, "2026-11-14", "A", "open"], ["Kubis", 420, 420, "2026-11-18", "A", "closed"], ["Tomat", 180, 0, "2026-11-20", "B", "open"]],
  [["Selada", 110, 60, "2026-11-11", "A", "open"], ["Timun", 200, 90, "2026-11-13", "B", "open"], ["Wortel", 260, 0, "2026-11-13", "A", "open"], ["Sawi", 160, 20, "2026-11-13", "A", "open"], ["Tomat", 160, 0, "2026-11-13", "A", "open"], ["Selada", 100, 0, "2026-11-12", "A", "open"]],
  [["Kubis", 380, 120, "2026-11-16", "A", "open"], ["Terong", 150, 50, "2026-11-15", "A", "open"], ["Cabai Merah", 95, 0, "2026-11-12", "A", "open"], ["Bawang Putih", 110, 10, "2026-11-18", "B", "open"]],
  [["Tomat", 240, 100, "2026-11-17", "A", "open"], ["Bawang Merah", 140, 40, "2026-11-17", "A", "open"], ["Bawang Putih", 120, 0, "2026-11-19", "B", "open"], ["Jeruk", 200, 20, "2026-11-14", "A", "open"]],
  [["Wortel", 280, 140, "2026-11-13", "A", "open"], ["Selada", 100, 0, "2026-11-16", "A", "open"], ["Alpukat", 130, 30, "2026-11-20", "A", "open"], ["Kubis", 200, 0, "2026-11-17", "A", "open"]],
  [["Terong", 180, 80, "2026-11-15", "A", "open"], ["Timun", 210, 0, "2026-11-18", "B", "open"], ["Mangga", 190, 90, "2026-11-22", "A", "open"], ["Bawang Merah", 130, 20, "2026-11-16", "A", "open"]],
  [["Jahe Merah", 70, 20, "2026-11-21", "A", "open"], ["Cabai Merah", 100, 40, "2026-11-18", "A", "open"], ["Jeruk", 310, 120, "2026-11-15", "A", "open"], ["Pisang", 220, 30, "2026-11-13", "A", "open"]],
  [["Pisang", 260, 100, "2026-11-14", "A", "open"], ["Mangga", 190, 0, "2026-11-22", "A", "open"], ["Alpukat", 140, 50, "2026-11-20", "A", "open"], ["Jahe Merah", 90, 10, "2026-11-20", "A", "open"]],
];

async function seedFarmerForecasts(farmerId, farmerIndex, hubIdByName) {
  const { data: existing, error: readError } = await supabase
    .from("harvest_forecasts")
    .select("commodity_id, expected_harvest_date")
    .eq("farmer_id", farmerId);
  if (readError) throw readError;
  const existingKeys = new Set((existing ?? []).map((row) => `${row.commodity_id}:${row.expected_harvest_date}`));

  const hubId = farmerIndex % 2 === 0 ? hubIdByName.get("Hub Tabanan") : hubIdByName.get("Titik Kumpul Karangasem");

  const { data: commodities, error: commodityError } = await supabase
    .from("commodities")
    .select("id, name");
  if (commodityError) throw commodityError;

  const commodityId = new Map(commodities.map((commodity) => [commodity.name, commodity.id]));

  const rows = FORECAST_SETS[farmerIndex]
    .map(([commodity, est_kg, reserved_kg, expected_harvest_date, grade, status]) => {
      const pricing = PRICE_BY_COMMODITY[commodity];
      if (!pricing) throw new Error(`Missing price seed for ${commodity}.`);
      return {
        farmer_id: farmerId,
        commodity_id: commodityId.get(commodity),
        est_kg,
        reserved_kg,
        expected_harvest_date,
        grade,
        status,
        production_cost_per_kg: pricing[0],
        price_per_kg: pricing[1],
        hub_id: hubId,
        verification_status: "verified",
      };
    })
    .filter((row) => !existingKeys.has(`${row.commodity_id}:${row.expected_harvest_date}`));

  if (rows.some((row) => !row.commodity_id)) {
    throw new Error("Reference commodities were not seeded.");
  }
  if (rows.length === 0) return;

  const { error } = await supabase.from("harvest_forecasts").insert(rows);
  if (error) throw error;
}

await seedReferenceData();
const hubIdByName = await seedHubs();

const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers({ perPage: 100 });
if (listError) throw listError;

for (const [index, user] of users.entries()) {
  const found = existingUsers.users.find((candidate) => candidate.email === user.email);
  let id = found?.id;

  if (!id) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) throw error;
    id = data.user.id;
  }

  const { error } = await supabase.from("profiles").upsert({
    id,
    role: user.role,
    display_name: user.display_name,
    org_name: user.org_name,
    regency: user.regency,
    wa_number: user.wa_number,
    is_simulated: true,
  });
  if (error) throw error;

  if (user.role === "farmer") await seedFarmerForecasts(id, index, hubIdByName);
  console.log(`${user.role}: ${user.email}`);
}

console.log(`Seed selesai: ${farmerUsers.length} petani, 1 buyer, 1 coordinator.`);
