import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { loadOrder, orderWithCards } from "@/lib/orders";

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    const user = await requireUser();
    const orderId = Number((await ctx.params).id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return apiError("订单 ID 无效", 400);
    }
    const order = orderWithCards(loadOrder(orderId, user.id));
    return json({ order });
  });
}
