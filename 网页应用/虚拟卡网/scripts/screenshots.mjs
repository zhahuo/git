#!/usr/bin/env node
/**
 * 桌面/移动端页面截图（模块5 集成交付）
 *
 * 依赖捆绑运行时里的 playwright 与系统 Edge/Chrome。运行前先 pnpm start -p 3000。
 * 默认输出 docs/screenshots/。
 *
 * 用法：
 *   node scripts/screenshots.mjs
 *   SMOKE_BASE_URL=http://127.0.0.1:3000 node scripts/screenshots.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BASE_URL = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const OUT_DIR = path.join(process.cwd(), "docs", "screenshots");
const PLAYWRIGHT_ENTRY =
  process.env.PLAYWRIGHT_PATH ||
  "C:/Users/袁/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
const EDGE_PATH = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const { chromium } = await import(pathToFileURL(PLAYWRIGHT_ENTRY).href);

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

const CART_ITEMS = [
  {
    productId: 1,
    name: "Steam 充值卡 50 元",
    cover: "/covers/steam.svg",
    priceCents: 4690,
    originalPriceCents: 5000,
    quantity: 1,
    stock: 60,
    available: true,
  },
  {
    productId: 4,
    name: "爱奇艺黄金 VIP 月卡",
    cover: "/covers/iqiyi.svg",
    priceCents: 1590,
    originalPriceCents: 2500,
    quantity: 2,
    stock: 55,
    available: true,
  },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

async function launchBrowser() {
  const attempts = [
    { channel: "msedge" },
    { executablePath: EDGE_PATH },
    { executablePath: CHROME_PATH },
    {},
  ];
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options });
    } catch (err) {
      console.warn(`浏览器启动失败 ${JSON.stringify(options)}: ${err.message}`);
    }
  }
  throw new Error("没有可用的 Chromium/Edge/Chrome 浏览器");
}

async function pageFetch(page, pathname, body) {
  return page.evaluate(
    async ({ pathname: path, body: payload }) => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload === null ? undefined : JSON.stringify(payload),
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        // 忽略非 JSON 响应
      }
      return { status: res.status, data };
    },
    { pathname, body }
  );
}

async function loginViaPage(page, username, password) {
  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle", timeout: 30_000 });
  const res = await pageFetch(page, "/api/auth/login", { username, password });
  if (res.status !== 200) throw new Error(`登录 ${username} 失败: ${res.status}`);
}

async function detectTextOverlaps(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0" &&
        rect.width > 2 &&
        rect.height > 2
      );
    };
    const hasDirectText = (element) =>
      Array.from(element.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
      );
    const elements = Array.from(document.querySelectorAll("body *")).filter((element) => {
      if (!visible(element)) return false;
      const style = getComputedStyle(element);
      if (style.position === "fixed" || style.position === "sticky") return false;
      if (!element.textContent || !element.textContent.trim()) return false;
      return hasDirectText(element) || element.children.length === 0;
    });
    const overlaps = [];
    for (let i = 0; i < elements.length; i++) {
      const a = elements[i].getBoundingClientRect();
      for (let j = i + 1; j < elements.length; j++) {
        const b = elements[j].getBoundingClientRect();
        if (elements[i].contains(elements[j]) || elements[j].contains(elements[i])) continue;
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width <= 2 || height <= 2) continue;
        const area = width * height;
        const minArea = Math.min(a.width * a.height, b.width * b.height);
        if (area > 4 && area / minArea > 0.15) {
          overlaps.push({
            a: elements[i].textContent.trim().replace(/\s+/g, " ").slice(0, 40),
            b: elements[j].textContent.trim().replace(/\s+/g, " ").slice(0, 40),
            area: Math.round(area),
          });
        }
      }
    }
    return overlaps.slice(0, 20);
  });
}

async function shoot(context, slug, pathname, { waitText, extraDelay = 500 } = {}) {
  const only = (process.env.SHOOT_ONLY ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (only.length > 0 && !only.includes(slug)) return [];
  const results = [];
  for (const viewport of VIEWPORTS) {
    const page = await context.newPage({ viewport });
    const url = `${BASE_URL}${pathname}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    if (waitText) {
      await page
        .waitForSelector(`text=${waitText}`, { timeout: 15_000 })
        .catch(() => console.warn(`  未等到 "${waitText}"，继续截图: ${url}`));
    }
    await page.waitForTimeout(extraDelay);
    const overlaps = await detectTextOverlaps(page);
    const file = path.join(OUT_DIR, `${viewport.name}-${slug}.png`);
    await page.screenshot({ path: file, fullPage: true });
    results.push({ file, overlaps });
    console.log(`SHOT  ${file}${overlaps.length ? `  · 文本重叠告警 ${overlaps.length} 处` : ""}`);
    if (process.env.SCREENSHOT_DIAG === "1") {
      for (const overlap of overlaps) {
        console.log(`  OVERLAP ${overlap.a}  <->  ${overlap.b}  (${overlap.area}px²)`);
      }
    }
    await page.close();
  }
  return results;
}

const browser = await launchBrowser();

try {
  const guest = await browser.newContext();
  const user = await browser.newContext();
  const admin = await browser.newContext();

  // 公开页面
  await shoot(guest, "home", "/", { waitText: "虚拟卡" });
  await shoot(guest, "product-1", "/products/1", { waitText: "加入购物车" });
  await shoot(guest, "login", "/auth/login", { waitText: "登录" });

  // 用户链路：购物车 / 结算 / 收银台 / 个人中心
  await user.addInitScript(([key, value]) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, ["vc-cart-v1", CART_ITEMS]);
  const setupPage = await user.newPage();
  await loginViaPage(setupPage, "user", "user123");
  const recharge = await pageFetch(setupPage, "/api/balance/recharge", { amount_cents: 10000 });
  if (recharge.status !== 201) throw new Error(`充值失败: ${recharge.status}`);
  const orderRes = await pageFetch(setupPage, "/api/orders", {
    items: [
      { product_id: 1, quantity: 1 },
      { product_id: 4, quantity: 2 },
    ],
    remark: "截图演示订单",
  });
  if (orderRes.status !== 201) throw new Error(`创建演示订单失败: ${orderRes.status}`);
  const order = orderRes.data.order;
  await setupPage.close();

  await shoot(user, "cart", "/cart", { waitText: "购物车" });
  await shoot(user, "checkout", "/checkout", { waitText: "确认订单" });
  await shoot(user, "pay", `/pay/${order.id}`, { waitText: "收银台" });
  await shoot(user, "account", "/account", { waitText: "最近订单" });
  await shoot(user, "account-orders", "/account/orders", { waitText: "我的订单" });
  await shoot(user, "account-cards", "/account/cards", { waitText: "我的卡密" });

  // 管理端
  const adminPage = await admin.newPage();
  await loginViaPage(adminPage, "admin", "admin123");
  await adminPage.close();
  await shoot(admin, "admin", "/admin", { waitText: "在售商品数" });
  await shoot(admin, "admin-products", "/admin/products", { waitText: "商品管理" });
  await shoot(admin, "admin-cards", "/admin/cards", { waitText: "卡密管理" });
  await shoot(admin, "admin-orders", "/admin/orders", { waitText: "订单管理" });

  await Promise.all([guest.close(), user.close(), admin.close()]);
  console.log(`\n截图完成，共 ${VIEWPORTS.length * 13} 张，输出目录: ${OUT_DIR}`);
} finally {
  await browser.close();
}
