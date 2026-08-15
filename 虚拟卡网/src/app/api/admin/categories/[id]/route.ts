import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Category } from "@/lib/types";

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("分类 ID 无效", 400);
    }
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
    const exists = db
      .prepare("SELECT id FROM categories WHERE (name = ? OR slug = ?) AND id != ?")
      .get(name, slug, id);
    if (exists) return apiError("分类名称或别名已存在", 409);
    const result = db
      .prepare("UPDATE categories SET name = ?, slug = ?, sort_order = ? WHERE id = ?")
      .run(name, slug, sortOrder, id);
    if (Number(result.changes) === 0) return apiError("分类不存在", 404);
    const category = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as unknown as Category;
    return json({ category });
  });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("分类 ID 无效", 400);
    }
    const result = db.prepare("DELETE FROM categories WHERE id = ?").run(id);
    if (Number(result.changes) === 0) return apiError("分类不存在", 404);
    return json({ ok: true });
  });
}
