import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cancelOrder, deliverOrder, orderWithCards } from "@/lib/orders";

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("订单 ID 无效", 400);
    }
    const body = await request.json().catch(() => null);
    const action = body?.action;
    if (action === "cancel") {
      const order = cancelOrder(id);
      return json({ order });
    }
    if (action === "deliver") {
      const result = deliverOrder(id);
      return json({ order: orderWithCards(result.order), cards: result.cards });
    }
    return apiError("action 需为 cancel 或 deliver", 400);
  });
}
