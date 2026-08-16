import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogger } from "../lib/logger.mjs";
import { createState } from "../lib/state.mjs";
import { createSender } from "../lib/sender.mjs";
import { createCardClient } from "../lib/card-client.mjs";
import { handleEvent } from "../lib/bridge.mjs";
import { loadSettings } from "../lib/config.mjs";
import { startMockServer } from "./mock-server.mjs";
import { startBridgeServer } from "../server.mjs";

let passed = 0;
let failed = 0;

function assert(cond, label, detail) {
  if (cond) {
    passed += 1;
    console.log(`  PASS ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${detail !== undefined ? ` - ${JSON.stringify(detail)}` : ""}`);
  }
}

const mapping = {
  items: [
    { item_id: "ITEM-1", product_id: 1, quantity: 2, title: "Steam 50 元 秒发", enabled: true },
    { item_id: "ITEM-2", product_id: 2, quantity: 1, title: "库存不足测试", enabled: true },
    { item_id: "ITEM-3", product_id: 3, quantity: 1, title: "重复测试", enabled: true },
    { item_id: "ITEM-4", product_id: 4, quantity: 1, title: "重试测试", enabled: true },
  ],
  aliases: [{ title_contains: "Steam 50", product_id: 1, quantity: 1, enabled: true }],
};

function makeDeps({ mock, state, logDir, token = "test-token", messageOverrides = {} }) {
  process.env.INTEGRATION_API_TOKEN = token;
  const config = loadSettings({
    overrides: {
      cardApi: { baseUrl: mock.baseUrl, tokenEnv: "INTEGRATION_API_TOKEN", timeoutMs: 3000 },
      retry: { maxRetries: 2, baseDelayMs: 20, maxDelayMs: 50 },
      sender: { http: { url: `${mock.baseUrl}/send`, timeoutMs: 3000, headers: {} } },
      notifyAdmin: { http: { url: `${mock.baseUrl}/notify`, timeoutMs: 3000, headers: {} } },
      message: messageOverrides,
      logDir,
    },
  });
  const logger = createLogger({ dir: logDir, name: "bridge-test", consoleOut: false });
  const cardClient = createCardClient(config, logger);
  const sender = createSender(config, logger);
  return { config, state, logger, mapping, cardClient, sender };
}

async function runMockTests() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xianyu-bridge-mock-"));
  const mock = await startMockServer();
  try {
    const logDir = path.join(tmp, "logs");
    const state = createState({ dir: path.join(tmp, "state"), file: "bridge.db" });
    const deps = makeDeps({ mock, state, logDir });

    const r1 = await handleEvent(
      { external_order_no: "XY-200-1", item_id: "ITEM-1", buyer_id: "buyer-1", trigger: "order_paid" },
      deps
    );
    assert(r1.status === "sent", "200 领卡成功并标记 sent", r1);
    assert(mock.stats.sends.length === 1, "合并模式只发送 1 条消息");
    assert(mock.stats.sends[0]?.content.includes(r1.claim_no), "消息包含 claim_no");
    assert(r1.cards?.length === 2, "映射数量 2 张生效", r1);
    assert(state.get("XY-200-1")?.status === "sent", "本地状态为 sent");

    const state2 = createState({ dir: path.join(tmp, "state-401"), file: "bridge.db" });
    const beforeSends2 = mock.stats.sends.length;
    const r2 = await handleEvent(
      { external_order_no: "XY-401-1", item_id: "ITEM-1", buyer_id: "buyer-2" },
      makeDeps({ mock, state: state2, logDir, token: "wrong-token" })
    );
    assert(r2.status === "failed" && r2.auth_error === true, "401 未授权标记 failed", r2);
    assert(mock.stats.sends.length === beforeSends2, "401 不发送买家消息");
    assert(mock.stats.notifies.some((n) => n.status === "failed"), "401 通知管理员");
    state2.close();
    process.env.INTEGRATION_API_TOKEN = "test-token";

    const r3a = await handleEvent(
      { external_order_no: "XY-409-DUP", item_id: "ITEM-3", buyer_id: "buyer-3" },
      deps
    );
    assert(r3a.status === "sent", "重复场景首次领卡成功", r3a);
    state.delete("XY-409-DUP");
    const beforeSends3 = mock.stats.sends.length;
    const r3b = await handleEvent(
      { external_order_no: "XY-409-DUP", item_id: "ITEM-3", buyer_id: "buyer-3" },
      deps
    );
    assert(r3b.status === "already_claimed", "卡网返回已发过卡 409 时标记 already_claimed", r3b);
    assert(mock.stats.sends.length === beforeSends3, "收到已发过卡 409 后不再发送");
    assert(
      mock.stats.claims.filter((c) => c.external_order_no === "XY-409-DUP").length === 2,
      "第二次触发仍到达卡网并命中幂等"
    );

    const r4 = await handleEvent(
      { external_order_no: "XY-409-STOCK", item_id: "ITEM-2", buyer_id: "buyer-4" },
      deps
    );
    assert(r4.status === "business_error", "库存不足 409 标记 business_error", r4);
    assert(
      mock.stats.sends.some((s) => s.content === "库存不足，请联系客服"),
      "库存不足时回复买家固定文案"
    );
    assert(mock.stats.notifies.some((n) => n.status === "business_error"), "库存不足时通知管理员");

    const r5 = await handleEvent(
      { external_order_no: "XY-RETRY-1", item_id: "ITEM-4", buyer_id: "buyer-5" },
      deps
    );
    assert(r5.status === "sent", "临时 503 重试后发货成功", r5);
    assert(
      mock.stats.claims.filter((c) => c.external_order_no === "XY-RETRY-1").length === 3,
      "重试 2 次共尝试 3 次"
    );

    const r6 = await handleEvent(
      { external_order_no: "XY-NO-MAP", item_id: "ITEM-999", title: "未知商品" },
      deps
    );
    assert(r6.status === "mapping_missing", "未映射商品返回 mapping_missing", r6);
    assert(mock.stats.notifies.some((n) => n.status === "mapping_missing"), "映射缺失通知管理员");

    const state7 = createState({ dir: path.join(tmp, "state-per"), file: "bridge.db" });
    const deps7 = makeDeps({ mock, state: state7, logDir, messageOverrides: { sendMode: "per_card" } });
    const beforeSends7 = mock.stats.sends.length;
    const r7 = await handleEvent(
      { external_order_no: "XY-PER-1", item_id: "ITEM-1", quantity: 2, buyer_id: "buyer-7" },
      deps7
    );
    assert(r7.status === "sent", "逐条模式发货成功", r7);
    assert(mock.stats.sends.length === beforeSends7 + 2, "逐条模式发送 2 条消息");
    state7.close();

    const serverMappingPath = path.join(tmp, "mapping.json");
    fs.writeFileSync(serverMappingPath, JSON.stringify(mapping, null, 2), "utf8");
    const svc = await startBridgeServer({
      port: 0,
      triggerToken: "svc-token",
      mappingPath: serverMappingPath,
      overrides: {
        runtimeDir: path.join(tmp, "state-server"),
        logDir: path.join(tmp, "logs-server"),
        cardApi: { baseUrl: mock.baseUrl, tokenEnv: "INTEGRATION_API_TOKEN", timeoutMs: 3000 },
        retry: { maxRetries: 2, baseDelayMs: 20, maxDelayMs: 50 },
        sender: { http: { url: `${mock.baseUrl}/send`, timeoutMs: 3000, headers: {} } },
        notifyAdmin: { http: { url: `${mock.baseUrl}/notify`, timeoutMs: 3000, headers: {} } },
      },
    });
    try {
      const res = await fetch(`http://127.0.0.1:${svc.port}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer svc-token" },
        body: JSON.stringify({
          external_order_no: "XY-HTTP-1",
          item_id: "ITEM-1",
          buyer_id: "buyer-http",
          trigger: "message",
        }),
      });
      const data = await res.json();
      assert(res.status === 200 && data.delivery?.status === "sent", "HTTP /trigger 接入成功", data);

      const health = await fetch(`http://127.0.0.1:${svc.port}/health`);
      assert(health.status === 200, "HTTP /health 可用");

      const bad = await fetch(`http://127.0.0.1:${svc.port}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer wrong" },
        body: JSON.stringify({ external_order_no: "XY-HTTP-2", item_id: "ITEM-1" }),
      });
      assert(bad.status === 401, "触发端点鉴权 401");
    } finally {
      await svc.close();
    }

    state.close();
  } finally {
    await mock.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function runRealTests() {
  const baseUrl = process.env.CARD_BASE_URL || "http://127.0.0.1:3007";
  const token = process.env.INTEGRATION_API_TOKEN || "";
  if (!token) throw new Error("请先设置 INTEGRATION_API_TOKEN 并启动卡网服务");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xianyu-bridge-real-"));
  const logDir = path.join(tmp, "logs");
  const state = createState({ dir: path.join(tmp, "state"), file: "bridge.db" });
  const config = loadSettings({
    overrides: {
      cardApi: { baseUrl, tokenEnv: "INTEGRATION_API_TOKEN", timeoutMs: 5000 },
      retry: { maxRetries: 0, baseDelayMs: 20, maxDelayMs: 50 },
      sender: { http: { url: "", timeoutMs: 3000, headers: {} } },
      notifyAdmin: { http: { url: "", timeoutMs: 3000, headers: {} } },
      logDir,
    },
  });
  const logger = createLogger({ dir: logDir, name: "bridge-real", consoleOut: false });
  const realMapping = {
    items: [{ item_id: "REAL-ITEM", product_id: 1, quantity: 1, enabled: true }],
    aliases: [],
  };
  const cardClient = createCardClient(config, logger);
  const sender = createSender(config, logger);
  const deps = { config, state, logger, mapping: realMapping, cardClient, sender };
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert(health.status === 200, "卡网健康检查 200");

    process.env.INTEGRATION_API_TOKEN = "wrong-token";
    const r401 = await handleEvent(
      { external_order_no: `XIANYU-M7-401-${Date.now()}`, item_id: "REAL-ITEM", buyer_id: "real-buyer" },
      deps
    );
    assert(r401.status === "failed" && r401.auth_error === true, "真实接口 401 被识别", r401);

    process.env.INTEGRATION_API_TOKEN = token;
    const orderNo = `XIANYU-M7-${Date.now()}`;
    const r200 = await handleEvent(
      { external_order_no: orderNo, item_id: "REAL-ITEM", buyer_id: "real-buyer", trigger: "order_paid" },
      deps
    );
    assert(
      r200.status === "sent" && String(r200.claim_no ?? "").startsWith("EXT"),
      "真实接口 200 领卡成功",
      r200
    );

    state.delete(orderNo);
    const rDup = await handleEvent(
      { external_order_no: orderNo, item_id: "REAL-ITEM", buyer_id: "real-buyer" },
      deps
    );
    assert(rDup.status === "already_claimed", "真实接口重复订单返回 409 已发过卡", rDup);

    const rStock = await handleEvent(
      { external_order_no: `${orderNo}-STOCK`, item_id: "REAL-ITEM", quantity: 99, buyer_id: "real-buyer" },
      deps
    );
    assert(
      rStock.status === "business_error" && rStock.error.includes("库存不足"),
      "真实接口库存不足 409 被识别",
      rStock
    );
    console.log("真实接口验证完成；测试已消耗卡密，请执行：pnpm db:reset && node src/lib/db.ts");
  } finally {
    state.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const t0 = Date.now();
if (process.argv.includes("--real")) {
  await runRealTests();
} else {
  await runMockTests();
}
console.log(`\n通过 ${passed} 项，失败 ${failed} 项，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(failed > 0 ? 1 : 0);
