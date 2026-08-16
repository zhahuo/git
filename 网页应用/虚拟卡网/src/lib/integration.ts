import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { ApiError } from "./api";
import { db } from "./db";

export function requireIntegrationToken(request: NextRequest): void {
  const expected = process.env.INTEGRATION_API_TOKEN?.trim();
  if (!expected) {
    throw new ApiError("集成令牌未配置，请设置 INTEGRATION_API_TOKEN 环境变量", 503);
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    throw new ApiError("缺少 Authorization: Bearer <token>", 401);
  }
  const actual = Buffer.from(match[1]);
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length || !timingSafeEqual(actual, expectedBuf)) {
    throw new ApiError("集成令牌无效", 401);
  }
}

export interface ClaimCardsInput {
  product_id: number;
  quantity: number;
  external_order_no?: string;
}

export function claimCards(input: ClaimCardsInput) {
  const productId = Number(input.product_id);
  const quantity = Number(input.quantity);
  const externalOrderNo =
    typeof input.external_order_no === "string" ? input.external_order_no.trim().slice(0, 100) : "";

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new ApiError("product_id 无效", 400);
  }
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
    throw new ApiError("quantity 需为 1-99 的整数", 400);
  }

  const product = db
    .prepare("SELECT id, name, is_active FROM products WHERE id = ?")
    .get(productId) as unknown as { id: number; name: string; is_active: number } | undefined;
  if (!product) {
    throw new ApiError("商品不存在", 404);
  }
  if (!product.is_active) {
    throw new ApiError("商品已下架", 409);
  }

  db.exec("BEGIN IMMEDIATE");
  try {
    if (externalOrderNo) {
      const duplicate = db
        .prepare("SELECT id, claim_no FROM integration_claims WHERE external_order_no = ?")
        .get(externalOrderNo) as unknown as { id: number; claim_no: string } | undefined;
      if (duplicate) {
        throw new ApiError(`该外部订单已发过卡（${duplicate.claim_no}），请勿重复发货`, 409);
      }
    }

    const cards = db
      .prepare(
        "SELECT id, content FROM cards WHERE product_id = ? AND status = 'available' ORDER BY id LIMIT ?"
      )
      .all(productId, quantity) as unknown as Array<{ id: number; content: string }>;
    if (cards.length < quantity) {
      throw new ApiError(`《${product.name}》库存不足，仅剩 ${cards.length} 件`, 409);
    }

    const claimNo = `EXT${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
    const markSold = db.prepare(
      "UPDATE cards SET status = 'sold', sold_at = datetime('now') WHERE id = ? AND status = 'available'"
    );
    for (const card of cards) {
      const result = markSold.run(card.id);
      if (Number(result.changes) !== 1) {
        throw new ApiError("库存状态发生变化，请重试", 409);
      }
    }

    db.prepare(
      "UPDATE products SET sales_count = sales_count + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(quantity, productId);
    db.prepare(
      `INSERT INTO integration_claims (claim_no, external_order_no, product_id, quantity, card_ids)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      claimNo,
      externalOrderNo || null,
      productId,
      quantity,
      JSON.stringify(cards.map((card) => card.id))
    );

    const stockRow = db
      .prepare("SELECT COUNT(*) AS c FROM cards WHERE product_id = ? AND status = 'available'")
      .get(productId) as unknown as { c: number };
    db.exec("COMMIT");

    return {
      claim_no: claimNo,
      external_order_no: externalOrderNo || null,
      product_id: productId,
      product_name: product.name,
      quantity,
      cards: cards.map((card) => ({ id: card.id, content: card.content })),
      remaining_stock: Number(stockRow.c),
    };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
