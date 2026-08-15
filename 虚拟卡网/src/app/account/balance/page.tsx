import RequireAuth from "@/components/account/require-auth";
import { BalancePanel } from "@/components/account/balance-panel";

export default function AccountBalancePage() {
  return (
    <RequireAuth next="/account/balance">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">余额记录</h1>
      </div>
      <BalancePanel />
    </RequireAuth>
  );
}
