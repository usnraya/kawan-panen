"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CommerceError, addCartItem, removeCartItem, updateCartItem } from "@/lib/commerce";

export type CartActionState = { error?: string; success?: string } | null;

function message(error: unknown) {
  if (error instanceof CommerceError && error.message === "UNAUTHENTICATED") {
    return "LOGIN_REQUIRED";
  }
  return error instanceof Error ? error.message : "Keranjang belum dapat diperbarui.";
}

export async function addItem(_previous: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    const productId = String(formData.get("productId") ?? "");
    const qtyKg = Number(formData.get("qtyKg") ?? 0);
    await addCartItem(productId, qtyKg);
    revalidatePath("/buyer/cart");
    revalidatePath("/buyer/availability");
    return { success: "Produk ditambahkan ke keranjang." };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function updateItem(_previous: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    await updateCartItem(String(formData.get("productId") ?? ""), Number(formData.get("qtyKg") ?? 0));
    revalidatePath("/buyer/cart");
    return { success: "Keranjang diperbarui." };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function removeItem(_previous: CartActionState, formData: FormData): Promise<CartActionState> {
  try {
    await removeCartItem(String(formData.get("productId") ?? ""));
    revalidatePath("/buyer/cart");
    return { success: "Produk dihapus dari keranjang." };
  } catch (error) {
    return { error: message(error) };
  }
}

export async function requireCartLogin() {
  redirect("/login?next=/buyer/cart");
}
