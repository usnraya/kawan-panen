"use client";

import Link from "next/link";
import { useState, useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register, type RegisterState } from "./actions";

const initialState: RegisterState = null;

export function RegisterForm() {
  const [state, formAction, pending] = useActionState(register, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="displayName">Nama kamu</Label><Input id="displayName" name="displayName" placeholder="Nama pengelola" required /></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="orgName">Nama usaha/kelompok</Label><Input id="orgName" name="orgName" placeholder="Hotel atau kelompok tani" required /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="regency">Kabupaten</Label><select id="regency" name="regency" required className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="">Pilih kabupaten</option>{["Badung", "Bangli", "Buleleng", "Denpasar", "Gianyar", "Jembrana", "Karangasem", "Klungkung", "Tabanan"].map((item) => <option key={item}>{item}</option>)}</select></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="role">Saya sebagai</Label><select id="role" name="role" defaultValue="buyer" required className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="buyer">Buyer / pembeli usaha</option><option value="farmer">Petani / kelompok tani</option></select></div>
      </div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" placeholder="nama@organisasi.id" required /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="password">Kata sandi</Label><div className="relative"><Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Minimal 8 karakter" minLength={8} required className="pr-11" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-800">{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="passwordConfirmation">Ulangi kata sandi</Label><div className="relative"><Input id="passwordConfirmation" name="passwordConfirmation" type={showPasswordConfirmation ? "text" : "password"} autoComplete="new-password" placeholder="Ulangi kata sandi" minLength={8} required className="pr-11" /><button type="button" onClick={() => setShowPasswordConfirmation((value) => !value)} aria-label={showPasswordConfirmation ? "Sembunyikan konfirmasi kata sandi" : "Tampilkan konfirmasi kata sandi"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-800">{showPasswordConfirmation ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
      </div>
      {state?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{state.error}</p>}
      {state?.success && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">{state.success}</p>}
      <Button type="submit" disabled={pending} className="mt-2 h-11 w-full bg-emerald-800 font-semibold hover:bg-emerald-900">{pending ? "Membuat akun…" : "Buat akun"}</Button>
      <p className="text-center text-sm text-zinc-600">Sudah punya akun? <Link href="/login" className="font-bold text-emerald-800 hover:underline">Masuk</Link></p>
    </form>
  );
}
