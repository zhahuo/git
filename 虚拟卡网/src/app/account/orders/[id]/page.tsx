import RequireAuth from "@/components/account/require-auth";
import { OrderDetail } from "@/components/account/order-detail";

export default async function AccountOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orderId = Number(id);
  return (
    <RequireAuth next={`/account/orders/${id}`}>
      <OrderDetail orderId={Number.isInteger(orderId) && orderId > 0 ? orderId : 0} />
    </RequireAuth>
  );
}
