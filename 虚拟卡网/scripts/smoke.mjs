#!/usr/bin/env node
/**
 * 模块5 集成冒烟测试
 *
 * 依赖 Node 24 全局 fetch，默认请求 http://127.0.0.1:3000。
 * 运行前请先执行 pnpm db:reset，并启动 pnpm start（或 dev）。
 *
 * 用法：
 *   node scripts/smoke.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/smoke.mjs
 */

import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const BASE_URL = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");

let passed = 0;
const failures = [];
const cookies = new Map();

function cookieHeader(name) {
  return cookies.get(name) ?? "";
}

function storeCookies(res, name) {
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const setCookie of setCookies) {
    const [pair] = setCookie.split(";");
    const key = pair.split("=")[0];
    const jar = (cookies.get(name) ?? "")
      .split(";")
      .filter((item) => item.trim().split("=")[0] !== key)
      .join(";");
    cookies.set(name, jar ? `${jar}; ${pair}` : pair);
  }
}

async function api(pathname, { method = "GET", body, as } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (as) headers.cookie = cookieHeader(as);
  const res = await fetch(BASE_URL + pathname, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (as) storeCookies(res, as);
  return { status: res.status, data };
}

function expect(condition, message) {
  if (!condition) throw new Error(message || "断言失败");
}

function expectStatus(res, status, message) {
  expect(
    res.status === status,
    message || `期望状态 ${status}，实际 ${res.status}${res.data?.error ? `（${res.data.error}）` : ""}`
  );
}

function expectEqual(actual, expected, message) {
  expect(
    actual === expected,
    message || `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`
  );
}

async function check(name, fn) {
  const start = Date.now();
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    failures.push({ name, error: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

console.log(`虚拟卡网冒烟测试  base=${BASE_URL}\n`);

// 公共接口与商品浏览
await check("健康检查 GET /api/health", async () => {
  const res = await api("/api/health");
  expectStatus(res, 200);
  expectEqual(res.data.ok, true);
});

await check("商品列表与库存字段 GET /api/products", async () => {
  const res = await api("/api/products");
  expectStatus(res, 200);
  expect(Array.isArray(res.data.products) && res.data.products.length >= 8, "种子商品数应不少于 8");
  const product = res.data.products[0];
  expect(typeof product.price_cents === "number" && product.price_cents >= 0, "商品应包含价格");
  expect(typeof product.stock_count === "number", "商品应包含可用库存");
  expect(typeof product.cover === "string" && product.cover.startsWith("/covers/"), "商品封面应指向本地 SVG");
});

await check("商品搜索与分类筛选", async () => {
  const search = await api("/api/products?q=Steam");
  expectStatus(search, 200);
  expect(search.data.products.length >= 1, "关键词搜索应返回结果");
  const category = await api(`/api/products?category=${encodeURIComponent("游戏充值")}`);
  expectStatus(category, 200);
  expect(
    category.data.products.length >= 1 &&
      category.data.products.every((product) => product.category_name === "游戏充值"),
    "分类筛选应只返回该分类商品"
  );
});

await check("商品详情 GET /api/products/1", async () => {
  const res = await api("/api/products/1");
  expectStatus(res, 200);
  expectEqual(res.data.product.id, 1);
});

await check("分类列表 GET /api/categories", async () => {
  const res = await api("/api/categories");
  expectStatus(res, 200);
  expect(Array.isArray(res.data.categories) && res.data.categories.length >= 4, "种子分类应不少于 4 个");
});

// 注册与登录
let smokeUsername = "";
await check("注册新用户并自动登录", async () => {
  smokeUsername = `smoke_${Date.now().toString(36)}`;
  const res = await api("/api/auth/register", {
    method: "POST",
    body: { username: smokeUsername, password: "123456", nickname: "冒烟用户" },
    as: "new",
  });
  expectStatus(res, 201);
  expectEqual(res.data.user.username, smokeUsername);
  const me = await api("/api/auth/me", { as: "new" });
  expectStatus(me, 200);
  expectEqual(me.data.user.username, smokeUsername);
});

await check("登录 user/user123", async () => {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { username: "user", password: "user123" },
    as: "user",
  });
  expectStatus(res, 200);
  expectEqual(res.data.user.role, "user");
});

await check("错误密码登录返回 401", async () => {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { username: "user", password: "wrong-password" },
    as: "user",
  });
  expectStatus(res, 401);
});

// 下单与模拟支付
let firstOrderId = 0;
let soldCardContent = "";
await check("创建订单并服务端计价", async () => {
  const product = (await api("/api/products/1")).data.product;
  const res = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 1, quantity: 1 }], remark: "冒烟测试订单" },
    as: "user",
  });
  expectStatus(res, 201);
  firstOrderId = res.data.order.id;
  expectEqual(res.data.order.status, "pending");
  expectEqual(res.data.order.total_cents, product.price_cents);
});

await check("模拟支付后订单 delivered 且绑定卡密", async () => {
  const res = await api(`/api/payments/${firstOrderId}`, {
    method: "POST",
    body: { method: "mock" },
    as: "user",
  });
  expectStatus(res, 200);
  expectEqual(res.data.order.status, "delivered");
  expect(Array.isArray(res.data.cards) && res.data.cards.length === 1, "应返回 1 张卡密");
  const card = res.data.cards[0];
  expectEqual(card.status, "sold");
  expect(card.order_item_id > 0 && card.content.trim().length > 0, "卡密应绑定订单明细且内容非空");
  soldCardContent = card.content;
});

await check("订单详情含卡密且不重复", async () => {
  const res = await api(`/api/orders/${firstOrderId}`, { as: "user" });
  expectStatus(res, 200);
  const cards = res.data.order.items.flatMap((item) => item.cards ?? []);
  expectEqual(cards.length, 1);
  const contents = cards.map((card) => card.content);
  expect(new Set(contents).size === contents.length, "同一订单内卡密不应重复");
});

await check("重复支付返回 409", async () => {
  const res = await api(`/api/payments/${firstOrderId}`, {
    method: "POST",
    body: { method: "mock" },
    as: "user",
  });
  expectStatus(res, 409);
});

await check("订单列表包含新订单", async () => {
  const res = await api("/api/orders", { as: "user" });
  expectStatus(res, 200);
  expect(res.data.orders.some((order) => order.id === firstOrderId), "订单列表应包含刚创建的订单");
});

// 余额支付与边界
await check("余额支付扣款并写入 balance_logs", async () => {
  const before = (await api("/api/balance", { as: "user" })).data.balance_cents;
  const product = (await api("/api/products/4")).data.product;
  const created = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 4, quantity: 1 }] },
    as: "user",
  });
  expectStatus(created, 201);
  const paid = await api(`/api/payments/${created.data.order.id}`, {
    method: "POST",
    body: { method: "balance" },
    as: "user",
  });
  expectStatus(paid, 200);
  expectEqual(paid.data.order.status, "delivered");
  const after = await api("/api/balance", { as: "user" });
  expectStatus(after, 200);
  expectEqual(after.data.balance_cents, before - product.price_cents);
  expect(
    after.data.logs.some(
      (log) =>
        log.type === "consume" &&
        log.change_cents === -product.price_cents &&
        log.note.includes(created.data.order.order_no)
    ),
    "余额流水应包含本次消费记录"
  );
});

await check("余额不足支付返回 409 且订单保持 pending", async () => {
  const balance = (await api("/api/balance", { as: "user" })).data.balance_cents;
  const product = (await api("/api/products/2")).data.product;
  expect(product.price_cents > balance, "测试商品价格应高于当前余额");
  const created = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 2, quantity: 1 }] },
    as: "user",
  });
  expectStatus(created, 201);
  const res = await api(`/api/payments/${created.data.order.id}`, {
    method: "POST",
    body: { method: "balance" },
    as: "user",
  });
  expectStatus(res, 409);
  const detail = await api(`/api/orders/${created.data.order.id}`, { as: "user" });
  expectEqual(detail.data.order.status, "pending", "支付失败后订单应保持待支付");
});

await check("余额充值并记录流水", async () => {
  const before = (await api("/api/balance", { as: "new" })).data.balance_cents;
  const res = await api("/api/balance/recharge", {
    method: "POST",
    body: { amount_cents: 10000 },
    as: "new",
  });
  expectStatus(res, 201);
  expectEqual(res.data.balance_cents, before + 10000);
  const after = await api("/api/balance", { as: "new" });
  expect(after.data.logs[0]?.type === "recharge", "最新流水应为充值记录");
});

await check("卡密不足下单返回 409", async () => {
  const product = (await api("/api/products/9")).data.product;
  const res = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 9, quantity: product.stock_count + 1 }] },
    as: "user",
  });
  expectStatus(res, 409);
});

// 鉴权边界
await check("未登录访问受保护接口返回 401", async () => {
  const me = await api("/api/auth/me");
  expectStatus(me, 401);
  const stats = await api("/api/admin/stats");
  expectStatus(stats, 401);
});

await check("普通用户访问管理端返回 403", async () => {
  const res = await api("/api/admin/products", { as: "user" });
  expectStatus(res, 403);
});

await check("普通用户查看他人订单返回 404", async () => {
  const res = await api(`/api/orders/${firstOrderId}`, { as: "new" });
  expectStatus(res, 404);
});

// 管理端
await check("登录 admin/admin123", async () => {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { username: "admin", password: "admin123" },
    as: "admin",
  });
  expectStatus(res, 200);
  expectEqual(res.data.user.role, "admin");
});

await check("统计接口含 totalUsers 与关键指标", async () => {
  const res = await api("/api/admin/stats", { as: "admin" });
  expectStatus(res, 200);
  expect(typeof res.data.totalUsers === "number" && res.data.totalUsers >= 2, "totalUsers 应返回用户总数");
  expect(typeof res.data.today.orders_count === "number", "应包含今日订单数");
  expect(typeof res.data.total.revenue_cents === "number", "应包含累计销售额");
  expect(Array.isArray(res.data.low_stock_products) && res.data.low_stock_products.length >= 1, "应包含低库存预警");
  expect(Array.isArray(res.data.category_sales), "应包含分类销售排行");
});

await check("管理端商品列表与详情", async () => {
  const list = await api("/api/admin/products", { as: "admin" });
  expectStatus(list, 200);
  expect(list.data.products.length >= 8, "商品列表应包含全部种子商品");
  const detail = await api("/api/admin/products/1", { as: "admin" });
  expectStatus(detail, 200);
  expectEqual(detail.data.product.id, 1);
});

await check("管理端分类列表", async () => {
  const res = await api("/api/admin/categories", { as: "admin" });
  expectStatus(res, 200);
  expect(res.data.categories.length >= 4, "分类列表应包含种子分类");
});

await check("卡密批量导入去重", async () => {
  const contents = ["SMOKE-1111-2222-3333", "SMOKE-1111-2222-3333", "SMOKE-1111-2222-4444"];
  const res = await api("/api/admin/cards", {
    method: "POST",
    body: { product_id: 1, contents },
    as: "admin",
  });
  expectStatus(res, 201);
  expectEqual(res.data.imported, 2);
  expectEqual(res.data.skipped, 1);
  const list = await api("/api/admin/cards?product_id=1&q=SMOKE-1111", { as: "admin" });
  expectStatus(list, 200);
  expectEqual(list.data.total, 2);
});

await check("同一卡密只发放一次", async () => {
  const res = await api("/api/admin/cards?status=sold&product_id=1&limit=200", { as: "admin" });
  expectStatus(res, 200);
  expect(res.data.cards.every((card) => card.status === "sold"), "筛选结果应全部为已售卡密");
  expectEqual(res.data.cards.filter((card) => card.content === soldCardContent).length, 1);
});

let availableCardId = 0;
let soldCardId = 0;
await check("可用卡密删除成功、已售卡密删除返回 409", async () => {
  const available = await api("/api/admin/cards?status=available&product_id=1&limit=1", { as: "admin" });
  expectStatus(available, 200);
  availableCardId = available.data.cards[0].id;
  const deleted = await api(`/api/admin/cards/${availableCardId}`, { method: "DELETE", as: "admin" });
  expectStatus(deleted, 200);
  expectEqual(deleted.data.ok, true);

  const sold = await api("/api/admin/cards?status=sold&product_id=1&limit=1", { as: "admin" });
  soldCardId = sold.data.cards[0].id;
  const denied = await api(`/api/admin/cards/${soldCardId}`, { method: "DELETE", as: "admin" });
  expectStatus(denied, 409);
});

await check("管理端商品新增/更新/删除", async () => {
  const category = (await api("/api/admin/categories", { as: "admin" })).data.categories[0];
  const created = await api("/api/admin/products", {
    method: "POST",
    body: {
      category_id: category.id,
      name: "冒烟测试商品",
      description: "模块5 冒烟测试",
      price_cents: 9900,
      original_price_cents: 10000,
      stock_alert_threshold: 5,
    },
    as: "admin",
  });
  expectStatus(created, 201);
  const productId = created.data.product.id;
  const patched = await api(`/api/admin/products/${productId}`, {
    method: "PATCH",
    body: { price_cents: 8800, is_active: 0 },
    as: "admin",
  });
  expectStatus(patched, 200);
  expectEqual(patched.data.product.price_cents, 8800);
  expectEqual(patched.data.product.is_active, 0);
  const deleted = await api(`/api/admin/products/${productId}`, { method: "DELETE", as: "admin" });
  expectStatus(deleted, 200);
});

await check("已有售出卡密的商品禁止删除", async () => {
  const res = await api("/api/admin/products/1", { method: "DELETE", as: "admin" });
  expectStatus(res, 409);
});

await check("管理端分类新增/更新/删除", async () => {
  const created = await api("/api/admin/categories", {
    method: "POST",
    body: { name: "冒烟分类", slug: "smoke-cat", sort_order: 99 },
    as: "admin",
  });
  expectStatus(created, 201);
  const categoryId = created.data.category.id;
  const updated = await api(`/api/admin/categories/${categoryId}`, {
    method: "PUT",
    body: { name: "冒烟分类改", slug: "smoke-cat-2", sort_order: 100 },
    as: "admin",
  });
  expectStatus(updated, 200);
  expectEqual(updated.data.category.name, "冒烟分类改");
  const deleted = await api(`/api/admin/categories/${categoryId}`, { method: "DELETE", as: "admin" });
  expectStatus(deleted, 200);
});

await check("管理端取消待支付订单", async () => {
  const created = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 5, quantity: 1 }] },
    as: "user",
  });
  expectStatus(created, 201);
  const cancelled = await api(`/api/admin/orders/${created.data.order.id}`, {
    method: "PATCH",
    body: { action: "cancel" },
    as: "admin",
  });
  expectStatus(cancelled, 200);
  expectEqual(cancelled.data.order.status, "cancelled");
  const again = await api(`/api/admin/orders/${created.data.order.id}`, {
    method: "PATCH",
    body: { action: "cancel" },
    as: "admin",
  });
  expectStatus(again, 409);
});

await check("管理端发货 paid 订单并绑定卡密", async () => {
  const created = await api("/api/orders", {
    method: "POST",
    body: { items: [{ product_id: 6, quantity: 1 }] },
    as: "user",
  });
  expectStatus(created, 201);
  const orderId = created.data.order.id;

  // 公共 API 的支付流程直接推进到 delivered，这里用 DB 把订单置为 paid 以覆盖管理端发货路径
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 5000;");
  const updated = db
    .prepare("UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ? AND status = 'pending'")
    .run(orderId);
  db.close();
  expectEqual(Number(updated.changes), 1, "测试订单应已置为 paid");

  const delivered = await api(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: { action: "deliver" },
    as: "admin",
  });
  expectStatus(delivered, 200);
  expectEqual(delivered.data.order.status, "delivered");
  expect(
    Array.isArray(delivered.data.cards) &&
      delivered.data.cards.length === 1 &&
      delivered.data.cards[0].status === "sold",
    "发货应返回已绑定的卡密"
  );
});

await check("管理端订单列表筛选", async () => {
  const res = await api("/api/admin/orders?status=delivered&limit=20", { as: "admin" });
  expectStatus(res, 200);
  expect(res.data.orders.length >= 1 && res.data.orders.every((order) => order.status === "delivered"), "筛选应返回已发货订单");
  expect(typeof res.data.total === "number", "列表应返回总数");
});

await check("退出登录后会话失效", async () => {
  const res = await api("/api/auth/logout", { method: "POST", as: "user" });
  expectStatus(res, 200);
  const me = await api("/api/auth/me", { as: "user" });
  expectStatus(me, 401);
});

const total = passed + failures.length;
console.log(`\n汇总: ${passed}/${total} PASS, ${failures.length} FAIL`);
if (failures.length > 0) {
  console.log("失败明细:");
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${failure.error}`);
  }
  process.exit(1);
}
process.exit(0);
