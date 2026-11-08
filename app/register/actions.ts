"use server";

import { redirect } from "next/navigation";
import { createAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth";
import type { UserRole } from "@/lib/database.types";

export type RegisterState = { error?: string; success?: string } | null;

const publicRoles = new Set<UserRole>(["buyer", "farmer"]);

export async function register(_previousState: RegisterState, formData: FormData): Promise<RegisterState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const orgName = String(formData.get("orgName") ?? "").trim();
  const regency = String(formData.get("regency") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const passwordConfirmation = String(formData.get("passwordConfirmation") ?? "");
  const role = String(formData.get("role") ?? "") as UserRole;

  if (!displayName || !orgName || !regency || !email || !password) {
    return { error: "Lengkapi semua data pendaftaran terlebih dahulu." };
  }
  if (!publicRoles.has(role)) return { error: "Pilih jenis akun yang tersedia." };
  if (!email.includes("@")) return { error: "Format email belum benar." };
  if (password.length < 8) return { error: "Kata sandi minimal 8 karakter." };
  if (password !== passwordConfirmation) return { error: "Konfirmasi kata sandi belum sama." };
  if (!hasSupabaseAdminEnv()) return { error: "Pendaftaran belum aktif karena konfigurasi akun server belum lengkap." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, org_name: orgName, regency, role } },
  });

  if (error || !data.user) return { error: error?.message ?? "Akun belum dapat dibuat. Coba gunakan email lain." };
  if (data.user.identities?.length === 0) return { error: "Email tersebut sudah terdaftar. Silakan masuk." };

  const admin = createAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    role,
    display_name: displayName,
    org_name: orgName,
    regency,
    wa_number: null,
    is_simulated: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "Akun belum dapat disiapkan. Coba lagi." };
  }

  if (data.session) redirect(ROLE_HOME[role]);

  return {
    success: "Akun berhasil dibuat. Cek email untuk verifikasi, lalu masuk ke Kawan Panen.",
  };
}
