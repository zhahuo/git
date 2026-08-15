import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Category } from "@/lib/types";

export function GET() {
  return runRoute(async () => {
    await requireAdmin();
    const categories = db
      .prepare(
        `SELECT c.*,
          (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
         FROM categories c
         ORDER BY c.sort_order ASC, c.id ASC`
      )
      .all() as unknown as Category[];
    return json({ categories });
  });
}

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const slug = typeof body?.slug === "string" ? body.slug.trim() : name;
    if (!name || name.length > 50) {
      return apiError("分类名称不能为空且不超过 50 字", 400);
    }
    if (!slug || slug.length > 50) {
      return apiError("分类别名不能为空且不超过 50 字", 400);
    }
    const sortOrder = Number(body?.sort_order ?? 0);
    if (!Number.isInteger(sortOrder)) {
      return apiError("排序值无效", 400);
    }
    const exists = db.prepare("SELECT id FROM categories WHERE name = ? OR slug = ?").get(name, slug);
    if (exists) return apiError("分类名称或别名已存在", 409);
    const result = db
      .prepare("INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)")
      .run(name, slug, sortOrder);
    const category = db
      .prepare("SELECT * FROM categories WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as unknown as Category;
    return json({ category }, 201);
  });
}
