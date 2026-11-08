import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/ui/info-hint";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { LoginForm } from "./login-form";

export const instant = false;

type LoginPageProps = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next } = await searchParams;
  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <Card className="w-full max-w-sm border-emerald-950/10 shadow-lg shadow-emerald-950/5">
          <CardHeader>
            <div className="flex items-center gap-2"><CardTitle className="text-xl text-emerald-950">Masuk ke Kawan Panen</CardTitle><InfoHint>Kelola panen, permintaan, dan koordinasi pasokan dalam satu tempat.</InfoHint></div>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
