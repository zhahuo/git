"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Package,
  ShoppingBag,
  TrendingUp,
  UserRound,
  Wallet,
} from "lucide-react";
import type { Order, Product } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
import { formatMoney, formatTime } from "@/components/admin/format";
import { EmptyState, Notice, Panel, Spinner } from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/admin/status";

interface StatsResponse {
  today: { orders_count: number; sales_count: number; revenue_cents: number };
  total: { orders_count: number; sales_count: number; revenue_cents: number };
  pending_orders_count: number;
  totalUsers: number;
  low_stock_products: Product[];
  category_sales: Array<{ name: string; sales_count: number; revenue_cents: number }>;
  recent_orders: Order[];
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsData, productsData] = await Promise.all([
        adminFetch<StatsResponse>("/api/admin/stats"),
        adminFetch<{ products: Product[] }>("/api/admin/products?status=active"),
      ]);
      setStats(statsData);
      setActiveCount(productsData.products.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !stats) {
    return (
      <Panel className="flex h-72 items-center justify-center">
        <Spinner className="h-6 w-6 text-slate-400" />
      </Panel>
    );
  }

  const metrics = stats
    ? [
        { label: "今日销售额", value: formatMoney(stats.today.revenue_cents), icon: Wallet },
        { label: "今日订单数", value: String(stats.today.orders_count), icon: ShoppingBag },
        { label: "累计销售额", value: formatMoney(stats.total.revenue_cents), icon: TrendingUp },
        { label: "累计订单数", value: String(stats.total.orders_count), icon: Clock },
        { label: "用户数", value: String(stats.totalUsers), icon: UserRound },
        { label: "在售商品数", value: activeCount === null ? "—" : String(activeCount), icon: Package },
      ]
    : [];

  const maxCategorySales = Math.max(
    1,
    ...(stats?.category_sales.map((item) => item.sales_count) ?? [1])
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900">概览</h1>
        <Link
          href="/admin/orders"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          订单管理
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {error && <Notice message={error} onClose={() => setError("")} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Panel key={metric.label} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-slate-500">{metric.label}</span>
                <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </div>
              <div className="mt-2 truncate text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">
                {metric.value}
              </div>
            </Panel>
          );
        })}
      </div>

      {stats?.pending_orders_count ? (
        <div className="mt-4 flex h-10 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">有 {stats.pending_orders_count} 笔订单待支付</span>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel>
          <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold text-slate-800">低库存预警</h2>
            <Link href="/admin/products" className="text-sm text-indigo-600 hover:text-indigo-700">
              商品管理
            </Link>
          </div>
          {stats && stats.low_stock_products.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.low_stock_products.slice(0, 8).map((product) => (
                <li key={product.id} className="flex h-12 items-center gap-3 px-4">
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{product.name}</span>
                  <span className="hidden w-20 shrink-0 truncate text-xs text-slate-400 sm:block">
                    {product.category_name ?? "未分类"}
                  </span>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      product.stock_count <= product.stock_alert_threshold
                        ? "font-medium text-amber-600"
                        : "text-slate-500"
                    }`}
                  >
                    库存 {product.stock_count}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    预警 {product.stock_alert_threshold}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Package className="h-5 w-5" />} text="暂无低库存商品" />
          )}
        </Panel>

        <Panel>
          <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4">
            <h2 className="text-sm font-semibold text-slate-800">最近订单</h2>
            <Link href="/admin/orders" className="text-sm text-indigo-600 hover:text-indigo-700">
              全部订单
            </Link>
          </div>
          {stats && stats.recent_orders.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {stats.recent_orders.slice(0, 8).map((order) => (
                <li key={order.id} className="flex h-12 items-center gap-3 px-4">
                  <span className="w-36 shrink-0 truncate font-mono text-xs text-slate-600">
                    {order.order_no}
                  </span>
                  <span className="hidden w-16 shrink-0 truncate text-sm text-slate-500 sm:block">
                    {order.username}
                  </span>
                  <OrderStatusBadge status={order.status} />
                  <span className="ml-auto shrink-0 text-sm font-medium tabular-nums text-slate-700">
                    {formatMoney(order.total_cents)}
                  </span>
                  <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-slate-400 md:block">
                    {formatTime(order.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Clock className="h-5 w-5" />} text="暂无订单" />
          )}
        </Panel>
      </div>

      <Panel className="mt-5">
        <div className="flex h-11 items-center justify-between border-b border-slate-200 px-4">
          <h2 className="text-sm font-semibold text-slate-800">分类销售排行</h2>
        </div>
        {stats && stats.category_sales.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {stats.category_sales.map((item) => (
              <li key={item.name} className="flex h-12 items-center gap-3 px-4">
                <span className="w-28 shrink-0 truncate text-sm text-slate-700 sm:w-40">
                  {item.name}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.round((item.sales_count / maxCategorySales) * 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm tabular-nums text-slate-600">
                  {item.sales_count}
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-slate-600">
                  {formatMoney(item.revenue_cents)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<TrendingUp className="h-5 w-5" />} text="暂无销售数据" />
        )}
      </Panel>
    </div>
  );
}
