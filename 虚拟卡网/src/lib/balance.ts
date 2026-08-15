import { ApiError } from "./api.ts";
import { db } from "./db.ts";
import type { BalanceLog } from "./types.ts";

export function getBalanceLogs(userId: number, limit = 50): BalanceLog[] {
  return db
    .prepare("SELECT * FROM balance_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, limit) as unknown as BalanceLog[];
}

export function rechargeBalance(userId: number, amountCents: number): {
  balance_cents: number;
  log: BalanceLog;
} {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 1_000_000) {
    throw new ApiError("充值金额需为 1-1000000 之间的整数分", 400);
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const user = db
      .prepare("SELECT balance_cents FROM users WHERE id = ?")
      .get(userId) as unknown as { balance_cents: number } | undefined;
    if (!user) throw new ApiError("用户不存在", 404);
    const balanceAfter = Number(user.balance_cents) + amountCents;
    db.prepare(
      "UPDATE users SET balance_cents = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(balanceAfter, userId);
    const result = db
      .prepare(
        "INSERT INTO balance_logs (user_id, change_cents, balance_after_cents, type, note) VALUES (?, ?, ?, 'recharge', ?)"
      )
      .run(userId, amountCents, balanceAfter, "演示充值");
    const log = db
      .prepare("SELECT * FROM balance_logs WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as unknown as BalanceLog;
    db.exec("COMMIT");
    return { balance_cents: balanceAfter, log };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // 无活动事务
    }
    throw err;
  }
}
