"use client";

import Link from "next/link";
import { useState, useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [error, formAction, pending] = useActionState(signIn, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="nama@organisasi.id" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Kata sandi</Label>
        <div className="relative">
          <Input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Masukkan kata sandi" required className="pr-11" />
          <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 hover:bg-emerald-50 hover:text-emerald-800">
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="mt-2 h-11 w-full bg-emerald-800 font-semibold hover:bg-emerald-900">
        {pending ? "Memproses…" : "Masuk"}
      </Button>
      <p className="text-center text-sm text-zinc-600">Belum punya akun? <Link href="/register" className="font-bold text-emerald-800 hover:underline">Buat akun</Link></p>
      <Link href="/" className="text-center text-sm font-medium text-emerald-800 hover:underline">Kembali ke beranda</Link>
    </form>
  );
}
