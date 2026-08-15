import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadProductRow } from "@/lib/products";

export function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("商品 ID 无效", 400);
    }
    const product = loadProductRow(id);
    if (!product) return apiError("商品不存在", 404);
    return json({ product });
  });
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("商品 ID 无效", 400);
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError("请求格式不正确", 400);
    }
    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    if (body.name !== undefined) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name || name.length > 100) return apiError("商品名称不能为空且不超过 100 字", 400);
      updates.push("name = ?");
      params.push(name);
    }
    if (body.description !== undefined) {
      const description = typeof body.description === "string" ? body.description.slice(0, 2000) : "";
      updates.push("description = ?");
      params.push(description);
    }
    if (body.cover !== undefined) {
      const cover = typeof body.cover === "string" && body.cover.trim() ? body.cover.trim() : "/covers/card.svg";
      updates.push("cover = ?");
      params.push(cover);
    }
    if (body.category_id !== undefined) {
      const categoryId =
        body.category_id === null || body.category_id === "" ? null : Number(body.category_id);
      if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
        return apiError("分类 ID 无效", 400);
      }
      if (categoryId !== null && !db.prepare("SELECT id FROM categories WHERE id = ?").get(categoryId)) {
        return apiError("分类不存在", 404);
      }
      updates.push("category_id = ?");
      params.push(categoryId);
    }
    if (body.price_cents !== undefined) {
      const priceCents = Number(body.price_cents);
      if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
        return apiError("价格需为 0-100000000 之间的整数分", 400);
      }
      updates.push("price_cents = ?");
      params.push(priceCents);
    }
    if (body.original_price_cents !== undefined) {
      const original = body.original_price_cents === null || body.original_price_cents === "" ? null : Number(body.original_price_cents);
      if (original !== null && (!Number.isInteger(original) || original < 0)) {
        return apiError("划线价无效", 400);
      }
      updates.push("original_price_cents = ?");
      params.push(original);
    }
    if (body.is_active !== undefined) {
      const isActive = Number(body.is_active) === 1 ? 1 : 0;
      updates.push("is_active = ?");
      params.push(isActive);
    }
    if (body.stock_alert_threshold !== undefined) {
      const threshold = Number(body.stock_alert_threshold);
      if (!Number.isInteger(threshold) || threshold < 0) return apiError("库存预警阈值无效", 400);
      updates.push("stock_alert_threshold = ?");
      params.push(threshold);
    }
    if (updates.length === 0) {
      return apiError("没有可更新的字段", 400);
    }
    updates.push("updated_at = datetime('now')");
    params.push(id);
    const result = db.prepare(`UPDATE products SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    if (Number(result.changes) === 0) return apiError("商品不存在", 404);
    return json({ product: loadProductRow(id) });
  });
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("商品 ID 无效", 400);
    }
    const sold = db
      .prepare("SELECT COUNT(*) AS c FROM cards WHERE product_id = ? AND status = 'sold'")
      .get(id) as unknown as { c: number } | undefined;
    if (Number(sold?.c ?? 0) > 0) {
      return apiError("商品已有售出卡密，无法删除，请改为下架", 409);
    }
    const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
    if (Number(result.changes) === 0) return apiError("商品不存在", 404);
    return json({ ok: true });
  });
}
