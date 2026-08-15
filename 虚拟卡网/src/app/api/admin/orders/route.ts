import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { listOrders } from "@/lib/orders";

const ORDER_STATUSES = ["pending", "paid", "delivered", "cancelled"];

export function GET(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status") ?? "";
    if (status && !ORDER_STATUSES.includes(status)) {
      return apiError("订单状态不合法", 400);
    }
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get("limit") ?? 50) || 50), 1), 200);
    const offset = Math.max(Math.trunc(Number(searchParams.get("offset") ?? 0) || 0), 0);
    const result = listOrders({ status: status || undefined, q: q || undefined, limit, offset });
    return json({ orders: result.orders, total: result.total });
  });
}
