import { NextRequest } from "next/server";
import { json, runRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { rechargeBalance } from "@/lib/balance";

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    const amountCents = Number(body?.amount_cents);
    const result = rechargeBalance(user.id, amountCents);
    return json(result, 201);
  });
}
