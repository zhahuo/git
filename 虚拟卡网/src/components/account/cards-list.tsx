"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";
import type { Order } from "@/lib/types";
import { fetchJson, isUnauthorized } from "./api";
import { formatTime } from "./format";
import { CopyButton } from "./copy-button";
import { EmptyState, ErrorState, LoadingState } from "./states";

interface PurchasedCard {
  orderId: number;
  orderNo: string;
  productName: string;
  content: string;
  soldAt: string | null;
}

export function CardsList() {
  const [cards, setCards] = useState<PurchasedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setCards(null);
    try {
      const res = await fetchJson<{ orders: Order[] }>("/api/orders");
      const deliveredOrders = res.orders.filter((order) => order.status === "delivered");
      const details = await Promise.all(
        deliveredOrders.map((order) =>
          fetchJson<{ order: Order }>(`/api/orders/${order.id}`)
        )
      );
      const collected: PurchasedCard[] = [];
      for (const detail of details) {
        for (const item of detail.order.items) {
          for (const card of item.cards ?? []) {
            collected.push({
              orderId: detail.order.id,
              orderNo: detail.order.order_no,
              productName: item.product_name,
              content: card.content,
              soldAt: card.sold_at,
            });
          }
        }
      }
      setCards(collected);
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign("/auth/login?next=%2Faccount%2Fcards");
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
  if (!cards) {
    return <LoadingState label="正在加载卡密" />;
  }
  if (cards.length === 0) {
    return <EmptyState title="还没有卡密" description="购买并支付成功后卡密会显示在这里" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-150 text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                商品
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                卡密
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                购买时间
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                订单号
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cards.map((card, index) => (
              <tr key={`${card.orderId}-${card.content}`} className="align-middle">
                <td className="max-w-40 px-4 py-3 font-medium text-slate-900">
                  <span className="line-clamp-2">{card.productName}</span>
                </td>
                <td className="px-4 py-3">
                  <code className="block max-w-64 break-all font-mono text-xs text-slate-700">
                    {card.content}
                  </code>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                  {formatTime(card.soldAt)}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/account/orders/${card.orderId}`}
                    className="block max-w-48 truncate font-mono text-xs text-slate-500 hover:text-slate-900"
                  >
                    {card.orderNo}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right">
                  <CopyButton value={card.content} label="复制" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-slate-100 sm:hidden">
        {cards.map((card) => (
          <li key={`${card.orderId}-${card.content}`} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{card.productName}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatTime(card.soldAt)}
                </p>
              </div>
              <div className="shrink-0">
                <CopyButton value={card.content} label="复制" />
              </div>
            </div>
            <code className="mt-3 block break-all rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              {card.content}
            </code>
            <Link
              href={`/account/orders/${card.orderId}`}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              <Ticket className="h-3.5 w-3.5" aria-hidden="true" />
              {card.orderNo}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
