import { NextRequest } from "next/server";
import { apiError, json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return runRoute(async () => {
    await requireAdmin();
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return apiError("卡密 ID 无效", 400);
    }
    const card = db
      .prepare("SELECT id, status FROM cards WHERE id = ?")
      .get(id) as unknown as { id: number; status: string } | undefined;
    if (!card) return apiError("卡密不存在", 404);
    if (card.status !== "available") {
      return apiError("已售出的卡密不能删除，需保留用于订单追溯", 409);
    }
    db.prepare("DELETE FROM cards WHERE id = ?").run(id);
    return json({ ok: true });
  });
}
