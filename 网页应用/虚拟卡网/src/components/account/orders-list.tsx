"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Order } from "@/lib/types";
import { fetchJson, isUnauthorized } from "./api";
import { formatCents, formatTime } from "./format";
import { StatusBadge } from "./status-badge";
import { EmptyState, ErrorState, LoadingState } from "./states";

export function OrdersList() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchJson<{ orders: Order[] }>("/api/orders");
      setOrders(res.orders);
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign("/auth/login?next=%2Faccount%2Forders");
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
  if (!orders) {
    return <LoadingState label="正在加载订单" />;
  }
  if (orders.length === 0) {
    return <EmptyState title="还没有订单" description="下单后订单会显示在这里" />;
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                订单 / 商品
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                状态
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                金额
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                下单时间
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orders.map((order) => (
              <tr key={order.id} className="transition-colors hover:bg-slate-50/70">
                <td className="max-w-56 px-4 py-3">
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="block truncate font-mono text-xs font-medium text-slate-700 hover:text-slate-900"
                  >
                    {order.order_no}
                  </Link>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {order.items[0]?.product_name}
                    {order.items.length > 1 ? ` 等 ${order.items.length} 件商品` : ""}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={order.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                  {formatCents(order.total_cents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatTime(order.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {order.status === "pending" ? (
                      <Link
                        href={`/pay/${order.id}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                      >
                        去支付
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ) : null}
                    <Link
                      href={`/account/orders/${order.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                    >
                      详情
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 sm:hidden">
        {orders.map((order) => (
          <li key={order.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-mono text-xs font-medium text-slate-700">
                {order.order_no}
              </p>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-2 truncate text-sm text-slate-500">
              {order.items[0]?.product_name}
              {order.items.length > 1 ? ` 等 ${order.items.length} 件商品` : ""}
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {formatCents(order.total_cents)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatTime(order.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {order.status === "pending" ? (
                  <Link
                    href={`/pay/${order.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    去支付
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : null}
                <Link
                  href={`/account/orders/${order.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  详情
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
