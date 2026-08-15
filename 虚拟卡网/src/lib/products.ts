import { db } from "./db.ts";
import type { Product } from "./types.ts";

export const ADMIN_PRODUCT_SELECT = `SELECT p.*, c.name AS category_name,
  (SELECT COUNT(*) FROM cards k WHERE k.product_id = p.id AND k.status = 'available') AS stock_count
 FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

export function loadProductRow(id: number): Product | undefined {
  return db
    .prepare(`${ADMIN_PRODUCT_SELECT} WHERE p.id = ?`)
    .get(id) as unknown as Product | undefined;
}
