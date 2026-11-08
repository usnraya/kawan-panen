import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-lg border-emerald-950/10 shadow-lg shadow-emerald-950/5">
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle className="text-xl text-emerald-950">Daftar ke Kawan Panen</CardTitle><InfoHint>Buat akun sebagai buyer atau petani menggunakan alamat email dan kata sandi yang Anda tentukan.</InfoHint></div>
          </CardHeader>
          <CardContent><RegisterForm /></CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
