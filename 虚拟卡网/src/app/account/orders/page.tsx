import RequireAuth from "@/components/account/require-auth";
import { OrdersList } from "@/components/account/orders-list";

export default function AccountOrdersPage() {
  return (
    <RequireAuth next="/account/orders">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">我的订单</h1>
      </div>
      <OrdersList />
    </RequireAuth>
  );
}
