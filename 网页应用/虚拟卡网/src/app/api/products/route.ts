import { NextRequest } from "next/server";
import { apiError, json } from "@/lib/api";
import { db } from "@/lib/db";
import type { Product } from "@/lib/types";

const SORTS: Record<string, string> = {
  newest: "p.created_at DESC, p.id DESC",
  price_asc: "p.price_cents ASC, p.id DESC",
  price_desc: "p.price_cents DESC, p.id DESC",
  sales: "p.sales_count DESC, p.id DESC",
};

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = (searchParams.get("q") ?? "").trim();
  const category = (searchParams.get("category") ?? "").trim();
  const sort = searchParams.get("sort") ?? "newest";
  const orderBy = SORTS[sort] ?? SORTS.newest;

  const products = db
    .prepare(
      `SELECT p.*, c.name AS category_name,
        (SELECT COUNT(*) FROM cards k WHERE k.product_id = p.id AND k.status = 'available') AS stock_count
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.is_active = 1
         AND (? = '' OR c.slug = ? OR c.name = ?)
         AND (? = '' OR p.name LIKE ? OR p.description LIKE ?)
       ORDER BY ${orderBy}
       LIMIT 200`
    )
    .all(category, category, category, q, `%${q}%`, `%${q}%`) as unknown as Product[];

  return json({ products });
}
