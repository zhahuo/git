import type { Metadata } from "next";
import { CheckoutView } from "@/components/storefront/checkout-view";

export const metadata: Metadata = {
  title: "确认订单",
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
