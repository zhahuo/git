import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Card } from "@/lib/types";

export function GET(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const productId = Number(searchParams.get("product_id") ?? "");
    const status = searchParams.get("status") ?? "";
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get("limit") ?? 50) || 50), 1), 200);
    const offset = Math.max(Math.trunc(Number(searchParams.get("offset") ?? 0) || 0), 0);
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (Number.isInteger(productId) && productId > 0) {
      clauses.push("k.product_id = ?");
      params.push(productId);
    }
    if (status === "available" || status === "sold") {
      clauses.push("k.status = ?");
      params.push(status);
    }
    if (q) {
      clauses.push("k.content LIKE ?");
      params.push(`%${q}%`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM cards k ${where}`)
      .get(...params) as unknown as { c: number } | undefined;
    const cards = db
      .prepare(
        `SELECT k.*, p.name AS product_name
         FROM cards k LEFT JOIN products p ON p.id = k.product_id
         ${where}
         ORDER BY k.id DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as Card[];
    return json({ cards, total: Number(totalRow?.c ?? 0) });
  });
}

export async function POST(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const body = await request.json().catch(() => null);
    const productId = Number(body?.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return apiError("product_id 无效", 400);
    }
    let contents: string[] = [];
    if (Array.isArray(body?.contents)) {
      contents = body.contents
        .filter((item: unknown): item is string => typeof item === "string")
        .map((item: string) => item.trim())
        .filter((item: string) => item.length > 0);
    } else if (typeof body?.content === "string") {
      contents = body.content
        .split(/\r?\n/)
        .map((item: string) => item.trim())
        .filter((item: string) => item.length > 0);
    }
    if (contents.length === 0) {
      return apiError("卡密内容不能为空", 400);
    }
    if (contents.length > 500) {
      return apiError("单次最多导入 500 条", 400);
    }
    const product = db.prepare("SELECT id FROM products WHERE id = ?").get(productId);
    if (!product) return apiError("商品不存在", 404);

    db.exec("BEGIN");
    try {
      const insert = db.prepare("INSERT OR IGNORE INTO cards (product_id, content) VALUES (?, ?)");
      let imported = 0;
      for (const content of contents) {
        if (content.length > 500) continue;
        const result = insert.run(productId, content);
        if (Number(result.changes) > 0) imported++;
      }
      db.exec("COMMIT");
      return json({ imported, skipped: contents.length - imported, product_id: productId }, 201);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });
}
