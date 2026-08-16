import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { createLogger } from "./lib/logger.mjs";
import { createState } from "./lib/state.mjs";
import { createSender } from "./lib/sender.mjs";
import { createCardClient } from "./lib/card-client.mjs";
import { handleEvent } from "./lib/bridge.mjs";
import { loadSettings, loadMapping, BRIDGE_ROOT } from "./lib/config.mjs";

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("JSON 解析失败"));
      }
    });
    req.on("error", reject);
  });
}

function resolveDir(dir) {
  return path.isAbsolute(dir) ? dir : path.join(BRIDGE_ROOT, dir);
}

function bearer(header) {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return match ? match[1] : "";
}

function tokenMatches(expected, candidate) {
  if (!expected || !candidate) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function startBridgeServer(options = {}) {
  const settings = loadSettings(options);
  const mapping = loadMapping(options);
  const logger = createLogger({ dir: resolveDir(settings.logDir), name: "bridge" });
  const state = createState({
    dir: resolveDir(settings.runtimeDir),
    file: settings.stateFile,
  });
  const cardClient = createCardClient(settings, logger);
  const sender = createSender(settings, logger);
  const port = Number(process.env.BRIDGE_PORT || options.port || 8787);
  const host = process.env.BRIDGE_HOST || options.host || "127.0.0.1";
  const triggerToken = (process.env.BRIDGE_TRIGGER_TOKEN || options.triggerToken || "").trim();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    try {
      if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
        sendJson(res, 200, {
          ok: true,
          service: "xianyu-bridge",
          time: new Date().toISOString(),
        });
        return;
      }
      if (req.method === "POST" && (url.pathname === "/trigger" || url.pathname === "/api/trigger")) {
        const provided = req.headers["x-bridge-token"] ?? bearer(req.headers.authorization ?? "");
        if (!tokenMatches(triggerToken, provided)) {
          sendJson(res, 401, { error: "缺少或错误的 BRIDGE_TRIGGER_TOKEN" });
          return;
        }
        let body;
        try {
          body = await readJson(req);
        } catch (err) {
          sendJson(res, 400, { error: err.message });
          return;
        }
        try {
          const delivery = await handleEvent(body, {
            config: settings,
            state,
            logger,
            mapping,
            cardClient,
            sender,
          });
          sendJson(res, 200, { ok: true, delivery });
        } catch (err) {
          logger.error("触发事件处理异常", { error: err.message, raw: body });
          sendJson(res, 400, { error: err.message });
        }
        return;
      }
      sendJson(res, 404, { error: "Not Found" });
    } catch (err) {
      logger.error("HTTP 处理异常", { error: err.message });
      sendJson(res, 500, { error: "服务器内部错误" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  logger.info("闲鱼发卡桥接服务已启动", {
    host,
    port,
    claimUrl: cardClient.claimUrl,
    senderUrl: settings.sender.http.url || "（未配置，仅记录日志）",
  });

  return {
    server,
    port,
    host,
    settings,
    state,
    logger,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      state.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startBridgeServer().catch((err) => {
    console.error("[bridge] 启动失败:", err);
    process.exit(1);
  });
}
