import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { DEMO_PROFILES } from "@/lib/demo-data";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROLE_HOME: Record<UserRole, string> = {
  farmer: "/farmer/forecasts",
  buyer: "/buyer/availability",
  coordinator: "/coordinator/dashboard",
};

export async function getCurrentProfile() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, display_name, org_name, regency")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

/** Redirects to /login if unauthenticated, or to the user's own home if role doesn't match. */
export async function requireRole(role: UserRole) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (profile.role !== role) redirect(ROLE_HOME[profile.role]);
  return profile;
}

/**
 * Returns the signed-in profile for this role, or a demo profile when there is no
 * Supabase session (local dev without credentials). A signed-in user with the
 * wrong role is still redirected to their own home.
 * ponytail: demo fallback is for pre-login local use; drop once real auth is required everywhere.
 */
export async function getProfileForRole(role: UserRole) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return DEMO_PROFILES[role];
  }

  return requireRole(role);
}
