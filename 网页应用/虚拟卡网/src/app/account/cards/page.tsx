import RequireAuth from "@/components/account/require-auth";
import { CardsList } from "@/components/account/cards-list";

export default function AccountCardsPage() {
  return (
    <RequireAuth next="/account/cards">
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-slate-900">我的卡密</h1>
      </div>
      <CardsList />
    </RequireAuth>
  );
}
