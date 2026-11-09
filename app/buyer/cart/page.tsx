import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CommerceError, getCartView } from "@/lib/commerce";
import { CartClient } from "./cart-client";
import { CheckoutButton } from "./checkout-button";

export const instant = false;

export default async function CartPage() {
  let cart;
  try {
    cart = await getCartView();
  } catch (error) {
    if (error instanceof CommerceError && error.message === "UNAUTHENTICATED") {
      redirect("/login?next=/buyer/cart");
    }
    cart = { lines: [], total: 0 };
  }

  return (
    <div className="flex flex-1 flex-col bg-[#f7faf7]">
      <SiteHeader cartCount={cart.lines.length} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-emerald-950">Keranjang</h1>
        <p className="mt-2 text-sm text-zinc-500">Periksa jumlah dan harga sebelum lanjut ke pembayaran.</p>
        <div className="mt-8"><CartClient lines={cart.lines} total={cart.total} checkoutSlot={<CheckoutButton disabled={!cart.lines.every((line) => line.shortfallKg === 0)} />} /></div>
      </main>
      <SiteFooter />
    </div>
  );
}
