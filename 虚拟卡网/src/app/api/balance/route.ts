import { json, runRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getBalanceLogs } from "@/lib/balance";

export async function GET() {
  return runRoute(async () => {
    const user = await requireUser();
    const logs = getBalanceLogs(user.id, 50);
    return json({ balance_cents: user.balance_cents, logs });
  });
}
