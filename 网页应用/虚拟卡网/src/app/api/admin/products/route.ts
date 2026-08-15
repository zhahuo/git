import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_PRODUCT_SELECT, loadProductRow } from "@/lib/products";
import type { Product } from "@/lib/types";

export function GET(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const q = (searchParams.get("q") ?? "").trim();
    const categoryId = Number(searchParams.get("category_id") ?? "");
    const status = searchParams.get("status") ?? "";
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (q) {
      clauses.push("(p.name LIKE ? OR p.description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }
    if (Number.isInteger(categoryId) && categoryId > 0) {
      clauses.push("p.category_id = ?");
      params.push(categoryId);
    }
    if (status === "active" || status === "inactive") {
      clauses.push("p.is_active = ?");
      params.push(status === "active" ? 1 : 0);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const products = db
      .prepare(`${ADMIN_PRODUCT_SELECT} ${where} ORDER BY p.id DESC LIMIT 200`)
      .all(...params) as unknown as Product[];
    return json({ products });
  });
}

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return apiError("请求格式不正确", 400);
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 100) {
      return apiError("商品名称不能为空且不超过 100 字", 400);
    }
    const priceCents = Number(body.price_cents);
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
      return apiError("价格需为 0-100000000 之间的整数分", 400);
    }
    const categoryId =
      body.category_id === null || body.category_id === undefined || body.category_id === ""
        ? null
        : Number(body.category_id);
    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return apiError("分类 ID 无效", 400);
    }
    if (categoryId !== null && !db.prepare("SELECT id FROM categories WHERE id = ?").get(categoryId)) {
      return apiError("分类不存在", 404);
    }
    const originalPriceCents =
      body.original_price_cents === null ||
      body.original_price_cents === undefined ||
      body.original_price_cents === ""
        ? null
        : Number(body.original_price_cents);
    if (originalPriceCents !== null && (!Number.isInteger(originalPriceCents) || originalPriceCents < 0)) {
      return apiError("划线价无效", 400);
    }
    const isActive = body.is_active === undefined || Number(body.is_active) === 1 ? 1 : 0;
    const threshold = Number(body.stock_alert_threshold ?? 10);
    if (!Number.isInteger(threshold) || threshold < 0) {
      return apiError("库存预警阈值无效", 400);
    }
    const description = typeof body.description === "string" ? body.description.slice(0, 2000) : "";
    const cover =
      typeof body.cover === "string" && body.cover.trim() ? body.cover.trim() : "/covers/card.svg";

    const result = db
      .prepare(
        `INSERT INTO products
          (category_id, name, description, cover, price_cents, original_price_cents, is_active, stock_alert_threshold)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(categoryId, name, description, cover, priceCents, originalPriceCents, isActive, threshold);
    const product = loadProductRow(Number(result.lastInsertRowid));
    return json({ product }, 201);
  });
}
