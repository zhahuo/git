import { NextRequest } from "next/server";
import { apiError, json } from "@/lib/api";
import { db } from "@/lib/db";
import type { Product } from "@/lib/types";

export function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return ctx.params.then(({ id }) => {
    const product = db
      .prepare(
        `SELECT p.*, c.name AS category_name,
          (SELECT COUNT(*) FROM cards k WHERE k.product_id = p.id AND k.status = 'available') AS stock_count
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ? AND p.is_active = 1`
      )
      .get(Number(id)) as unknown as Product | undefined;
    if (!product) return apiError("商品不存在", 404);
    return json({ product });
  });
}
