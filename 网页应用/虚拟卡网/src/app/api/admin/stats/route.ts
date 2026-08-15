import { json, runRoute } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { listOrders } from "@/lib/orders";
import type { Product } from "@/lib/types";

function shanghaiDayRange(): { start: string; end: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const toUtc = (time: string) =>
    new Date(`${ymd}T${time}+08:00`).toISOString().replace("T", " ").slice(0, 19);
  return { start: toUtc("00:00:00"), end: toUtc("23:59:59") };
}

export function GET() {
  return runRoute(async () => {
    await requireAdmin();
    const range = shanghaiDayRange();
    const todaySales = db
      .prepare(
        `SELECT COALESCE(SUM(oi.quantity), 0) AS sales_count,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue_cents
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status = 'delivered' AND o.paid_at >= ? AND o.paid_at <= ?`
      )
      .get(range.start, range.end) as unknown as { sales_count: number; revenue_cents: number };
    const totalSales = db
      .prepare(
        `SELECT COALESCE(SUM(oi.quantity), 0) AS sales_count,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue_cents
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status = 'delivered'`
      )
      .get() as unknown as { sales_count: number; revenue_cents: number };
    const todayOrders = db
      .prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'delivered' AND paid_at >= ? AND paid_at <= ?")
      .get(range.start, range.end) as unknown as { c: number };
    const totalOrders = db.prepare("SELECT COUNT(*) AS c FROM orders").get() as unknown as { c: number };
    const pendingOrders = db
      .prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'")
      .get() as unknown as { c: number };
    const totalUsers = db
      .prepare("SELECT COUNT(*) AS c FROM users")
      .get() as unknown as { c: number };
    const lowStockProducts = db
      .prepare(
        `SELECT * FROM (
           SELECT p.*, c.name AS category_name,
             (SELECT COUNT(*) FROM cards k WHERE k.product_id = p.id AND k.status = 'available') AS stock_count
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
         )
         WHERE stock_count <= stock_alert_threshold
         ORDER BY stock_count ASC, id ASC LIMIT 50`
      )
      .all() as unknown as Product[];
    const categorySales = db
      .prepare(
        `SELECT COALESCE(c.name, '未分类') AS name,
                COALESCE(SUM(oi.quantity), 0) AS sales_count,
                COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS revenue_cents
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id AND o.status = 'delivered'
         LEFT JOIN products p ON p.id = oi.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         GROUP BY c.id
         ORDER BY sales_count DESC, c.id ASC`
      )
      .all() as unknown as Array<{ name: string; sales_count: number; revenue_cents: number }>;
    const recent = listOrders({ limit: 10 });

    return json({
      today: {
        orders_count: Number(todayOrders?.c ?? 0),
        sales_count: Number(todaySales?.sales_count ?? 0),
        revenue_cents: Number(todaySales?.revenue_cents ?? 0),
      },
      total: {
        orders_count: Number(totalOrders?.c ?? 0),
        sales_count: Number(totalSales?.sales_count ?? 0),
        revenue_cents: Number(totalSales?.revenue_cents ?? 0),
      },
      pending_orders_count: Number(pendingOrders?.c ?? 0),
      totalUsers: Number(totalUsers?.c ?? 0),
      low_stock_products: lowStockProducts,
      category_sales: categorySales,
      recent_orders: recent.orders,
    });
  });
}
