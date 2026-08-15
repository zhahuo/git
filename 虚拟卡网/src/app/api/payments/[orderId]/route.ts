import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { orderWithCards, payOrder } from "@/lib/orders";

export async function POST(request: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  return runRoute(async () => {
    const user = await requireUser();
    const orderId = Number((await ctx.params).orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return apiError("订单 ID 无效", 400);
    }
    const body = await request.json().catch(() => null);
    const method = body?.method === "balance" ? "balance" : "mock";
    const result = payOrder(orderId, user.id, method);
    return json({ order: orderWithCards(result.order), cards: result.cards });
  });
}
