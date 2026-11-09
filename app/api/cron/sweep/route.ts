import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { runOperationalSweep } from "@/lib/server/fallback";

function validCronSecret(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

export async function GET(request: Request) {
  if (!hasSupabaseAdminEnv() || !process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Sweep belum dikonfigurasi." }, { status: 503 });
  }
  if (!validCronSecret(request)) {
    return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await runOperationalSweep()) });
  } catch {
    return NextResponse.json({ error: "Sweep operasional gagal." }, { status: 500 });
  }
}

export const POST = GET;
