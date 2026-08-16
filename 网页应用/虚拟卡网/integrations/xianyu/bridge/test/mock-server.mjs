import http from "node:http";

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export async function startMockServer() {
  const stats = { claims: [], sends: [], notifies: [], claimCount: 0 };
  const duplicateOrders = new Set();
  const retryCounts = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    try {
      if (req.method === "POST" && url.pathname === "/api/integration/cards/claim") {
        const body = await readJson(req);
        const auth = req.headers.authorization ?? "";
        if (auth !== "Bearer test-token") {
          send(res, 401, { error: "集成令牌无效" });
          return;
        }
        stats.claims.push(body);
        stats.claimCount += 1;
        const productId = Number(body.product_id);
        const quantity = Number(body.quantity);
        const external = String(body.external_order_no ?? "");

        if (productId === 1) {
          const claimNo = `EXT-MOCK-${String(stats.claimCount).padStart(4, "0")}`;
          send(res, 200, {
            ok: true,
            claim_no: claimNo,
            external_order_no: external,
            product_id: 1,
            product_name: "Steam 充值卡 50 元（Mock）",
            quantity,
            cards: Array.from({ length: quantity }, (_, i) => ({
              id: 1000 + stats.claimCount * 100 + i,
              content: `MOCK-${claimNo}-${i + 1}`,
            })),
            remaining_stock: 100 - quantity,
          });
          return;
        }
        if (productId === 2) {
          send(res, 409, { error: "《测试商品》库存不足，仅剩 0 件" });
          return;
        }
        if (productId === 3) {
          if (duplicateOrders.has(external)) {
            send(res, 409, {
              error: "该外部订单已发过卡（EXT-MOCK-DUP），请勿重复发货",
            });
            return;
          }
          duplicateOrders.add(external);
          send(res, 200, {
            ok: true,
            claim_no: "EXT-MOCK-DUP",
            external_order_no: external,
            product_id: 3,
            product_name: "重复测试商品（Mock）",
            quantity,
            cards: Array.from({ length: quantity }, (_, i) => ({
              id: 2000 + i,
              content: `DUP-${i + 1}`,
            })),
            remaining_stock: 50,
          });
          return;
        }
        if (productId === 4) {
          const count = (retryCounts.get(external) ?? 0) + 1;
          retryCounts.set(external, count);
          if (count < 3) {
            send(res, 503, { error: "服务暂时不可用（Mock）" });
            return;
          }
          send(res, 200, {
            ok: true,
            claim_no: `EXT-RETRY-${external}`,
            external_order_no: external,
            product_id: 4,
            product_name: "重试测试商品（Mock）",
            quantity,
            cards: Array.from({ length: quantity }, (_, i) => ({
              id: 3000 + i,
              content: `RETRY-${i + 1}`,
            })),
            remaining_stock: 10,
          });
          return;
        }
        send(res, 404, { error: "商品不存在" });
        return;
      }

      if (req.method === "POST" && url.pathname === "/send") {
        const body = await readJson(req);
        stats.sends.push(body);
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/notify") {
        const body = await readJson(req);
        stats.notifies.push(body);
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, { ok: true, service: "mock-card-server" });
        return;
      }
      send(res, 404, { error: "Not Found" });
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    stats,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
