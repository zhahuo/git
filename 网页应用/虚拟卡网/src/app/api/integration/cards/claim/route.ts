import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { claimCards, requireIntegrationToken } from "@/lib/integration";

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    requireIntegrationToken(request);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError("请求体必须为 JSON 对象", 400);
    }
    const result = claimCards({
      product_id: (body as { product_id?: number }).product_id ?? 0,
      quantity: (body as { quantity?: number }).quantity ?? 0,
      external_order_no: (body as { external_order_no?: string }).external_order_no,
    });
    return json({ ok: true, ...result });
  });
}
