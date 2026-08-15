import { json } from "@/lib/api";
import { db } from "@/lib/db";
import type { Category } from "@/lib/types";

export function GET() {
  const categories = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS product_count
       FROM categories c
       ORDER BY c.sort_order ASC, c.id ASC`
    )
    .all() as unknown as Category[];
  return json({ categories });
}
