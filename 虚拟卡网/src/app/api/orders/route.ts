import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createOrder, listOrders } from "@/lib/orders";

export async function GET() {
  return runRoute(async () => {
    const user = await requireUser();
    const { orders } = listOrders({ userId: user.id, limit: 100 });
    return json({ orders });
  });
}

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    const user = await requireUser();
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items)) {
      return apiError("请求格式不正确，items 必须为数组", 400);
    }
    const order = createOrder(user, {
      items: body.items,
      remark: typeof body.remark === "string" ? body.remark : undefined,
    });
    return json({ order }, 201);
  });
}
