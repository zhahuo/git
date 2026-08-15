import type { Metadata } from "next";
import { ProductDetail } from "@/components/storefront/product-detail";

export const metadata: Metadata = {
  title: "商品详情",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ProductDetail productId={id} />;
}
