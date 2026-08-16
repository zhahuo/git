#!/usr/bin/env node
/**
 * 闲鱼发卡全链路校验（模块5 集成）
 *
 * 模拟模块6 订单事件 -> 桥接 handleEvent -> 真实卡网领卡扣库存 ->
 * integration_claims 对账记录 -> 发送回调（本地接收端）收到卡密消息，
 * 并验证同一 external_order_no 重复触发不重复发卡。
 *
 * 前置：卡网已在 CARD_BASE_URL（默认 http://127.0.0.1:3000）运行，
 * 且已设置 INTEGRATION_API_TOKEN。
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const BASE_URL = (process.env.CARD_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "app.db");
const RECEIVER_PORT = Number(process.env.RECEIVER_PORT || 15799);
const BRIDGE_ROOT = path.join(process.cwd(), "integrations", "xianyu", "bridge");

const file = (name) => pathToFileURL(path.join(BRIDGE_ROOT, name)).href;
const { createCardClient } = await import(file("lib/card-client.mjs"));
const { createLogger } = await import(file("lib/logger.mjs"));
const { createState } = await import(file("lib/state.mjs"));
const { createSender } = await import(file("lib/sender.mjs"));
const { handleEvent } = await import(file("lib/bridge.mjs"));
const { loadSettings } = await import(file("lib/config.mjs"));

let passed = 0;
let failed = 0;

function assert(condition, label, detail) {
  if (condition) {
    passed += 1;
    console.log(`  PASS ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${label}${detail !== undefined ? ` - ${JSON.stringify(detail)}` : ""}`);
  }
}

const received = [];
const receiver = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const text = Buffer.concat(chunks).toString("utf8");
    received.push({ path: req.url, body: text ? JSON.parse(text) : null });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
});

await new Promise((resolve, reject) => {
  receiver.once("error", reject);
  receiver.listen(RECEIVER_PORT, "127.0.0.1", resolve);
});

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fullchain-"));
const state = createState({ dir: path.join(tmp, "state"), file: "bridge.db" });
const config = loadSettings({
  overrides: {
    cardApi: { baseUrl: BASE_URL, tokenEnv: "INTEGRATION_API_TOKEN", timeoutMs: 5000 },
    retry: { maxRetries: 0, baseDelayMs: 20, maxDelayMs: 50 },
    sender: { http: { url: `http://127.0.0.1:${RECEIVER_PORT}/send`, timeoutMs: 3000, headers: {} } },
    notifyAdmin: { http: { url: `http://127.0.0.1:${RECEIVER_PORT}/notify`, timeoutMs: 3000, headers: {} } },
    logDir: path.join(tmp, "logs"),
  },
});
const logger = createLogger({ dir: path.join(tmp, "logs"), name: "fullchain", consoleOut: false });
const mapping = {
  items: [{ item_id: "FULLCHAIN-ITEM", product_id: 1, quantity: 1, enabled: true }],
  aliases: [],
};
const deps = {
  config,
  state,
  logger,
  mapping,
  cardClient: createCardClient(config, logger),
  sender: createSender(config, logger),
};

try {
  const externalOrderNo = `FULLCHAIN-${Date.now()}`;
  const result = await handleEvent(
    {
      external_order_no: externalOrderNo,
      item_id: "FULLCHAIN-ITEM",
      buyer_id: "buyer-fullchain",
      trigger: "order_paid",
    },
    deps
  );

  assert(result.status === "sent", "事件触发后桥接发货成功", result);
  assert(String(result.claim_no ?? "").startsWith("EXT"), "返回卡网 claim_no", result);
  assert(received.some((r) => r.path === "/send"), "发送回调已收到卡密消息");
  const sendBody = received.find((r) => r.path === "/send")?.body;
  assert(
    sendBody?.content?.includes(result.claim_no) && sendBody?.content?.includes(result.cards?.[0]?.content),
    "发送消息包含 claim_no 与卡密内容",
    sendBody
  );

  const db = new DatabaseSync(DB_PATH);
  const claimRow = db
    .prepare("SELECT claim_no, external_order_no, product_id, quantity, card_ids FROM integration_claims WHERE external_order_no = ?")
    .get(externalOrderNo);
  db.close();
  assert(claimRow?.claim_no === result.claim_no, "integration_claims 对账记录已写入", claimRow);
  assert(claimRow?.product_id === 1 && claimRow?.quantity === 1, "对账记录商品与数量正确", claimRow);

  state.delete(externalOrderNo);
  const duplicate = await handleEvent(
    { external_order_no: externalOrderNo, item_id: "FULLCHAIN-ITEM", buyer_id: "buyer-fullchain" },
    deps
  );
  assert(duplicate.status === "already_claimed", "重复事件命中卡网幂等，不再发卡", duplicate);
  const db2 = new DatabaseSync(DB_PATH);
  const count = db2
    .prepare("SELECT COUNT(*) AS c FROM integration_claims WHERE external_order_no = ?")
    .get(externalOrderNo);
  db2.close();
  assert(Number(count?.c ?? 0) === 1, "重复触发后对账记录仍只有 1 条", count);
} finally {
  state.close();
  receiver.closeAllConnections?.();
  await new Promise((resolve) => receiver.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n全链路校验: ${passed} PASS, ${failed} FAIL`);
process.exitCode = failed > 0 ? 1 : 0;
