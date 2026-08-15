import type { Metadata } from "next";
import { CartView } from "@/components/storefront/cart-view";

export const metadata: Metadata = {
  title: "购物车",
};

export default function CartPage() {
  return <CartView />;
}
