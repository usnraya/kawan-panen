"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME } from "@/lib/auth";

export async function signIn(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const requestedNext = String(formData.get("next") ?? "");
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//")
    ? requestedNext
    : null;

  if (!email || !password) {
    return "Email dan kata sandi wajib diisi.";
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return "Email atau kata sandi salah.";
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (!profile) {
    await supabase.auth.signOut();
    return "Akun ini belum memiliki profil. Hubungi koordinator.";
  }

  redirect(next && profile.role === "buyer" ? next : ROLE_HOME[profile.role]);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
