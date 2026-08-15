import { ApiError } from "./api.ts";
import { db } from "./db.ts";
import { orderNo, paymentNo } from "./utils.ts";
import type { Card, Order, OrderItem, User } from "./types.ts";

export interface CreateOrderInput {
  items: Array<{ product_id: number; quantity: number }>;
  remark?: string;
}

export interface ListOrdersOptions {
  userId?: number;
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

interface ProductRow {
  id: number;
  category_id: number | null;
  category_name: string | null;
  name: string;
  description: string;
  cover: string;
  price_cents: number;
  original_price_cents: number | null;
  is_active: number;
  stock_alert_threshold: number;
  stock_count: number;
  sales_count: number;
  created_at: string;
  updated_at: string;
}

interface OrderRow {
  id: number;
  order_no: string;
  user_id: number;
  username: string;
  status: Order["status"];
  total_cents: number;
  remark: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

function productRow(id: number): ProductRow | undefined {
  return db
    .prepare(
      `SELECT p.*, c.name AS category_name,
        (SELECT COUNT(*) FROM cards k WHERE k.product_id = p.id AND k.status = 'available') AS stock_count
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ?`
    )
    .get(id) as unknown as ProductRow | undefined;
}

function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    order_no: row.order_no,
    user_id: row.user_id,
    username: row.username,
    status: row.status,
    total_cents: row.total_cents,
    remark: row.remark,
    paid_at: row.paid_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: [],
  };
}

export function createOrder(user: User, input: CreateOrderInput): Order {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ApiError("购物车为空，无法下单", 400);
  }
  const remark = typeof input.remark === "string" ? input.remark.slice(0, 200) : "";
  const prepared: Array<{ product_id: number; quantity: number }> = [];
  let totalCents = 0;

  for (const raw of input.items) {
    const productId = Number(raw.product_id);
    const quantity = Number(raw.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0 || quantity > 99) {
      throw new ApiError("商品数量不合法", 400);
    }
    const product = productRow(productId);
    if (!product || !product.is_active) {
      throw new ApiError("商品不存在或已下架", 400);
    }
    if (product.stock_count < quantity) {
      throw new ApiError(`《${product.name}》库存不足，仅剩 ${product.stock_count} 件`, 409);
    }
    prepared.push({ product_id: productId, quantity });
    totalCents += product.price_cents * quantity;
  }

  const orderId = Number(
    db
      .prepare("INSERT INTO orders (order_no, user_id, status, total_cents, remark) VALUES (?, ?, 'pending', ?, ?)")
      .run(orderNo(), user.id, totalCents, remark).lastInsertRowid
  );
  const insertItem = db.prepare(
    `INSERT INTO order_items (order_id, product_id, product_name, cover, unit_price_cents, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const p of prepared) {
    const product = productRow(p.product_id)!;
    insertItem.run(
      orderId,
      product.id,
      product.name,
      product.cover,
      product.price_cents,
      p.quantity
    );
  }
  return loadOrder(orderId, user.id);
}

export function loadOrder(orderId: number, userId?: number): Order {
  const row = db
    .prepare(
      `SELECT o.*, u.username
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.id = ? ${userId ? "AND o.user_id = ?" : ""}`
    )
    .get(orderId, ...(userId ? [userId] : [])) as unknown as OrderRow | undefined;
  if (!row) throw new ApiError("订单不存在", 404);

  const order = orderFromRow(row);
  order.items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
    .all(orderId) as unknown as OrderItem[];
  return order;
}

export function orderWithCards(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      cards: db
        .prepare("SELECT * FROM cards WHERE order_item_id = ? ORDER BY id")
        .all(item.id) as unknown as Card[],
    })),
  };
}

export function listOrders(options: ListOrdersOptions = {}): { orders: Order[]; total: number } {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
  if (options.userId !== undefined) {
    clauses.push("o.user_id = ?");
    params.push(options.userId);
  }
  if (options.status) {
    clauses.push("o.status = ?");
    params.push(options.status);
  }
  if (options.q) {
    clauses.push("(o.order_no LIKE ? OR u.username LIKE ?)");
    const like = `%${options.q}%`;
    params.push(like, like);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM orders o JOIN users u ON u.id = o.user_id ${where}`)
    .get(...params) as unknown as { c: number } | undefined;
  const total = Number(totalRow?.c ?? 0);
  const limit = Math.min(Math.max(Math.trunc(Number(options.limit) || 100), 1), 200);
  const offset = Math.max(Math.trunc(Number(options.offset) || 0), 0);
  const rows = db
    .prepare(
      `SELECT o.*, u.username
       FROM orders o JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.id DESC LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as OrderRow[];
  const itemsStmt = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id");
  const orders = rows.map((row) => {
    const order = orderFromRow(row);
    order.items = itemsStmt.all(order.id) as unknown as OrderItem[];
    return order;
  });
  return { orders, total };
}

function insufficientItem(order: Order): OrderItem | undefined {
  for (const item of order.items) {
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM cards WHERE product_id = ? AND status = 'available'")
      .get(item.product_id) as unknown as { c: number } | undefined;
    if (Number(row?.c ?? 0) < item.quantity) {
      return item;
    }
  }
  return undefined;
}

function bindCardsForOrder(order: Order): Card[] {
  const boundCards: Card[] = [];
  for (const item of order.items) {
    const cardRows = db
      .prepare("SELECT id FROM cards WHERE product_id = ? AND status = 'available' ORDER BY id LIMIT ?")
      .all(item.product_id, item.quantity) as unknown as Array<{ id: number }>;
    for (const card of cardRows) {
      db.prepare(
        "UPDATE cards SET status = 'sold', order_item_id = ?, sold_at = datetime('now') WHERE id = ?"
      ).run(item.id, card.id);
      const full = db.prepare("SELECT * FROM cards WHERE id = ?").get(card.id) as unknown as Card;
      boundCards.push(full);
    }
    db.prepare(
      "UPDATE products SET sales_count = sales_count + ?, updated_at = datetime('now') WHERE id = ?"
    ).run(item.quantity, item.product_id);
  }
  return boundCards;
}

export function payOrder(orderId: number, userId: number, method: "mock" | "balance"): {
  order: Order;
  cards: Card[];
} {
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = loadOrder(orderId, userId);
    if (order.status !== "pending") {
      throw new ApiError("订单当前状态不可支付", 409);
    }

    if (method === "balance") {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User | undefined;
      if (!user) {
        throw new ApiError("用户不存在", 404);
      }
      if (user.balance_cents < order.total_cents) {
        throw new ApiError("余额不足，请选择模拟支付或先充值", 409);
      }
    }

    const short = insufficientItem(order);
    if (short) {
      db.prepare(
        "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
      ).run(order.id);
      db.exec("COMMIT");
      throw new ApiError(`《${short.product_name}》库存不足，订单已取消，请重新下单`, 409);
    }

    const boundCards = bindCardsForOrder(order);

    if (method === "balance") {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User | undefined;
      const balanceAfter = Number(user?.balance_cents ?? 0) - order.total_cents;
      db.prepare(
        "UPDATE users SET balance_cents = balance_cents - ?, updated_at = datetime('now') WHERE id = ?"
      ).run(order.total_cents, userId);
      db.prepare(
        "INSERT INTO balance_logs (user_id, change_cents, balance_after_cents, type, note) VALUES (?, ?, ?, 'consume', ?)"
      ).run(userId, -order.total_cents, balanceAfter, `支付订单 ${order.order_no}`);
    }

    db.prepare(
      "INSERT INTO payments (payment_no, order_id, user_id, method, amount_cents, status) VALUES (?, ?, ?, ?, ?, 'success')"
    ).run(paymentNo(), order.id, userId, method, order.total_cents);
    db.prepare(
      "UPDATE orders SET status = 'delivered', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
    ).run(order.id);

    db.exec("COMMIT");
    return { order: loadOrder(order.id, userId), cards: boundCards };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // 库存不足分支已 COMMIT 取消订单，无需回滚
    }
    throw err;
  }
}

export function cancelOrder(orderId: number, userId?: number): Order {
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = loadOrder(orderId, userId);
    if (order.status !== "pending") {
      throw new ApiError("仅待支付订单可以取消", 409);
    }
    db.prepare(
      "UPDATE orders SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?"
    ).run(order.id);
    db.exec("COMMIT");
    return loadOrder(order.id, userId);
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // 无活动事务
    }
    throw err;
  }
}

export function deliverOrder(orderId: number): { order: Order; cards: Card[] } {
  db.exec("BEGIN IMMEDIATE");
  try {
    const order = loadOrder(orderId);
    if (order.status !== "paid") {
      throw new ApiError("仅已支付订单可以发货", 409);
    }
    const short = insufficientItem(order);
    if (short) {
      throw new ApiError(`《${short.product_name}》库存不足，无法发货`, 409);
    }
    const cards = bindCardsForOrder(order);
    db.prepare(
      "UPDATE orders SET status = 'delivered', paid_at = COALESCE(paid_at, datetime('now')), updated_at = datetime('now') WHERE id = ?"
    ).run(order.id);
    db.exec("COMMIT");
    return { order: loadOrder(order.id), cards };
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // 无活动事务
    }
    throw err;
  }
}
