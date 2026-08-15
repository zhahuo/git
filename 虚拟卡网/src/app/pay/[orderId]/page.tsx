import type { Metadata } from "next";
import { PayView } from "@/components/storefront/pay-view";

export const metadata: Metadata = {
  title: "收银台",
};

export default async function PayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PayView orderId={orderId} />;
}
