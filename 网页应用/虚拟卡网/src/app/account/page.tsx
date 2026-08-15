import RequireAuth from "@/components/account/require-auth";
import { Overview } from "@/components/account/overview";

export default function AccountPage() {
  return (
    <RequireAuth next="/account">
      <Overview />
    </RequireAuth>
  );
}
