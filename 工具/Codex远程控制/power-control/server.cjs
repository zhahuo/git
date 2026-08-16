'use strict';

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const ROOT = __dirname;
const HOST = process.env.POWER_HOST || "0.0.0.0";
const PORT = Number(process.env.POWER_PORT || 3740);

function loadConfig() {
  const raw = fs.readFileSync(path.join(ROOT, "config.json"), "utf8");
  return JSON.parse(raw);
}

const PASSWORD_HASH = hashPassword(loadConfig().password || "");

function hashPassword(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 65536) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function runDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

const ACTIONS = {
  test: () => {},
  shutdown: () => runDetached("shutdown", ["/s", "/t", "5", "/c", "Phone remote shutdown"]),
  restart: () => runDetached("shutdown", ["/r", "/t", "5", "/c", "Phone remote restart"]),
  sleep: () => setTimeout(() => runDetached("rundll32.exe", ["powrprof.dll,SetSuspendState", "0,1,0"]), 300),
  hibernate: () => setTimeout(() => runDetached("shutdown", ["/h"]), 300),
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    const html = fs.readFileSync(path.join(ROOT, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return res.end(html);
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { ok: true, service: "power-control" });
  }

  if (req.method === "POST" && url.pathname === "/api/power") {
    let body;
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      return sendJson(res, 400, { ok: false, error: "invalid json" });
    }

    const passwordHash = hashPassword(String(body.password || ""));
    if (!safeEqual(passwordHash, PASSWORD_HASH)) {
      return sendJson(res, 401, { ok: false, error: "unauthorized" });
    }

    const action = String(body.action || "");
    const runAction = ACTIONS[action];
    if (typeof runAction !== "function") {
      return sendJson(res, 400, { ok: false, error: "unknown action" });
    }
    runAction();
    return sendJson(res, 200, { ok: true, action });
  }

  return sendJson(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[power-control] listening on http://${HOST}:${PORT}`);
});
