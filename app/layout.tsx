import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { InstallAppPrompt } from "@/components/install-app-prompt";
import { RegisterServiceWorker } from "@/components/register-service-worker";

const poppins = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Kawan Panen",
  description:
    "Kawan Panen menghubungkan hasil panen petani dengan kebutuhan pembeli, lengkap dengan pemasok cadangan saat pasokan utama tidak terpenuhi.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Kawan Panen",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#064e3b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${poppins.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-zinc-50">
        {children}
        <RegisterServiceWorker />
        <InstallAppPrompt />
      </body>
    </html>
  );
}
