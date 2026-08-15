"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CreditCard, ExternalLink, Ticket } from "lucide-react";
import type { Order } from "@/lib/types";
import { fetchJson, isUnauthorized } from "./api";
import { formatCents, formatTime } from "./format";
import { CopyButton } from "./copy-button";
import { StatusBadge } from "./status-badge";
import { EmptyState, ErrorState, LoadingState } from "./states";

export function OrderDetail({ orderId }: { orderId: number }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setOrder(null);
    try {
      const res = await fetchJson<{ order: Order }>(`/api/orders/${orderId}`);
      setOrder(res.order);
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign(`/auth/login?next=%2Faccount%2Forders%2F${orderId}`);
        return;
      }
      setError(err instanceof Error ? err.message : "加载失败，请稍后重试");
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  if (error) {
    return <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (!order) {
    return <LoadingState label="正在加载订单详情" />;
  }

  const delivered = order.status === "delivered";
  const totalCards = order.items.reduce((sum, item) => sum + (item.cards?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <Link
        href="/account/orders"
        className="inline-flex h-8 items-center gap-1.5 rounded-md text-sm text-slate-500 transition-colors hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        返回我的订单
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-base font-semibold text-slate-900">
                {order.order_no}
              </h2>
              <StatusBadge status={order.status} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 sm:gap-x-8">
              <div>
                <dt className="text-xs text-slate-500">下单时间</dt>
                <dd className="mt-1 text-slate-900">{formatTime(order.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">支付时间</dt>
                <dd className="mt-1 text-slate-900">{formatTime(order.paid_at)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-slate-500">订单备注</dt>
                <dd className="mt-1 text-slate-900">{order.remark || "—"}</dd>
              </div>
            </dl>
          </div>
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-xs text-slate-500">订单金额</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCents(order.total_cents)}
            </p>
            {order.status === "pending" ? (
              <Link
                href={`/pay/${order.id}`}
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                去支付
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <CreditCard className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">商品明细</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-100 text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  商品
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  单价
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  数量
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  小计
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{item.product_name}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatCents(item.unit_price_cents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">× {item.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCents(item.unit_price_cents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-900">卡密</h3>
          </div>
          {delivered ? (
            <span className="text-xs text-slate-500">共 {totalCards} 张</span>
          ) : null}
        </div>
        {delivered ? (
          <div className="divide-y divide-slate-100">
            {order.items.map((item) => {
              const cards = item.cards ?? [];
              if (cards.length === 0) return null;
              return (
                <div key={item.id} className="px-4 py-4 sm:px-5">
                  <p className="text-sm font-medium text-slate-900">{item.product_name}</p>
                  <ul className="mt-3 space-y-2">
                    {cards.map((card) => (
                      <li
                        key={card.id}
                        className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/70 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <code className="break-all font-mono text-sm text-slate-800">
                          {card.content}
                        </code>
                        <div className="shrink-0">
                          <CopyButton value={card.content} label="复制卡密" />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <EmptyState
              title={order.status === "pending" ? "支付后自动发货" : "发货后展示卡密"}
            />
          </div>
        )}
      </section>

      <div className="flex items-center justify-end">
        <Link
          href="/account/cards"
          className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          查看全部卡密
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
