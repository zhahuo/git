"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  PackageCheck,
  ShoppingBag,
  Timer,
  Wallet,
} from "lucide-react";
import type { Order, PublicUser } from "@/lib/types";
import { fetchJson, isUnauthorized } from "./api";
import { formatCents, formatTime } from "./format";
import { StatusBadge } from "./status-badge";
import { EmptyState, ErrorState, LoadingState } from "./states";

export function Overview() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [meRes, ordersRes] = await Promise.all([
        fetchJson<{ user: PublicUser }>("/api/auth/me"),
        fetchJson<{ orders: Order[] }>("/api/orders"),
      ]);
      setUser(meRes.user);
      setOrders(ordersRes.orders);
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign("/auth/login?next=%2Faccount");
        return;
      }
      setError(err instanceof Error ? err.message : "加载失败，请稍后重试");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (error) {
    return <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (!user || !orders) {
    return <LoadingState label="正在加载个人中心" />;
  }

  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const deliveredCount = orders.filter((order) => order.status === "delivered").length;
  const recentOrders = orders.slice(0, 5);
  const displayName = user.nickname || user.username;

  const stats = [
    { label: "订单总数", value: orders.length, icon: ShoppingBag },
    { label: "待支付", value: pendingCount, icon: Timer },
    { label: "已发货", value: deliveredCount, icon: PackageCheck },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">你好，{displayName}</p>
            <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
              {user.username}
            </h2>
          </div>
          <Link
            href="/account/balance"
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
            当前余额 {formatCents(user.balance_cents)}
          </Link>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{stat.label}</p>
                <p className="mt-0.5 text-lg font-semibold leading-6 text-slate-900">
                  {stat.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-slate-900">最近订单</h3>
          <Link
            href="/account/orders"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-900"
          >
            全部订单
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <EmptyState title="还没有订单" description="选购商品后即可在这里查看订单" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {recentOrders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/account/orders/${order.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs font-medium text-slate-700">
                      {order.order_no}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {order.items[0]?.product_name}
                      {order.items.length > 1 ? ` 等 ${order.items.length} 件商品` : ""}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCents(order.total_cents)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatTime(order.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-slate-300"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/account/cards"
        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        查看我的卡密
      </Link>
    </div>
  );
}
