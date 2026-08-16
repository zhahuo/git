import { NextRequest } from "next/server";
import { json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

interface ClaimRow {
  id: number;
  claim_no: string;
  external_order_no: string | null;
  product_id: number;
  product_name: string | null;
  quantity: number;
  card_ids: string;
  created_at: string;
}

function normalizeDateParam(value: string, endOfDay: boolean): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return endOfDay ? `${trimmed} 23:59:59` : `${trimmed} 00:00:00`;
  }
  return trimmed;
}

export function GET(request: NextRequest) {
  return runRoute(async () => {
    await requireAdmin();
    const { searchParams } = request.nextUrl;
    const productId = Number(searchParams.get("product_id") ?? "");
    const externalOrderNo = (searchParams.get("external_order_no") ?? "").trim();
    const createdFrom = normalizeDateParam(searchParams.get("created_from") ?? "", false);
    const createdTo = normalizeDateParam(searchParams.get("created_to") ?? "", true);
    const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get("limit") ?? 50) || 50), 1), 200);
    const offset = Math.max(Math.trunc(Number(searchParams.get("offset") ?? 0) || 0), 0);

    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (Number.isInteger(productId) && productId > 0) {
      clauses.push("c.product_id = ?");
      params.push(productId);
    }
    if (externalOrderNo) {
      clauses.push("c.external_order_no LIKE ?");
      params.push(`%${externalOrderNo}%`);
    }
    if (createdFrom) {
      clauses.push("c.created_at >= ?");
      params.push(createdFrom);
    }
    if (createdTo) {
      clauses.push("c.created_at <= ?");
      params.push(createdTo);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const totalRow = db
      .prepare(`SELECT COUNT(*) AS c FROM integration_claims c ${where}`)
      .get(...params) as unknown as { c: number } | undefined;
    const claims = db
      .prepare(
        `SELECT c.id, c.claim_no, c.external_order_no, c.product_id,
                COALESCE(p.name, '') AS product_name, c.quantity, c.card_ids, c.created_at
         FROM integration_claims c
         LEFT JOIN products p ON p.id = c.product_id
         ${where}
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as unknown as ClaimRow[];

    return json({ claims, total: Number(totalRow?.c ?? 0) });
  });
}
