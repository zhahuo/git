"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import type { Card, Order } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
import { formatMoney, formatTime } from "@/components/admin/format";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Select,
  Spinner,
  TextInput,
} from "@/components/admin/ui";
import { OrderStatusBadge } from "@/components/admin/status";

const PAGE_SIZE = 50;

function groupCardsByItem(cards: Card[]): Record<number, Card[]> {
  const map: Record<number, Card[]> = {};
  for (const card of cards) {
    if (card.order_item_id !== null) {
      (map[card.order_item_id] ??= []).push(card);
    }
  }
  return map;
}

type OrderAction = "cancel" | "deliver";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [itemCards, setItemCards] = useState<Record<number, Card[]>>({});
  const [loadingCards, setLoadingCards] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: OrderAction;
    order: Order;
  } | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const data = await adminFetch<{ orders: Order[]; total: number }>(
        `/api/admin/orders?${params.toString()}`
      );
      setOrders(data.orders);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载订单失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const toggleExpand = async (order: Order) => {
    if (expandedId === order.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(order.id);
    if (order.status !== "delivered") return;
    const missing = order.items.filter((item) => itemCards[item.id] === undefined);
    if (missing.length === 0) return;
    setLoadingCards(true);
    try {
      const entries = await Promise.all(
        missing.map(async (item) => {
          const data = await adminFetch<{ cards: Card[] }>(
            `/api/admin/cards?status=sold&product_id=${item.product_id}&limit=200`
          );
          return [item.id, data.cards.filter((card) => card.order_item_id === item.id)] as const;
        })
      );
      setItemCards((current) => ({ ...current, ...Object.fromEntries(entries) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载卡密失败");
    } finally {
      setLoadingCards(false);
    }
  };

  const handleAction = async () => {
    if (!confirmAction) return;
    const { type, order } = confirmAction;
    setActionId(order.id);
    setError("");
    try {
      const data = await adminFetch<{ order: Order; cards: Card[] }>(
        `/api/admin/orders/${order.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ action: type }),
        }
      );
      if (type === "deliver") {
        setItemCards((current) => ({ ...current, ...groupCardsByItem(data.cards ?? []) }));
        setSuccess("订单已发货并绑定卡密");
        setExpandedId(order.id);
      } else {
        setSuccess("订单已取消");
      }
      setConfirmAction(null);
      await loadOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
      setConfirmAction(null);
    } finally {
      setActionId(null);
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="订单管理" />

      {error && <Notice message={error} onClose={() => setError("")} />}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{success}</span>
          <button
            type="button"
            onClick={() => setSuccess("")}
            className="shrink-0 rounded p-0.5 hover:bg-emerald-100"
            aria-label="关闭提示"
          >
            ×
          </button>
        </div>
      )}

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="状态" className="w-40">
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              <option value="pending">待支付</option>
              <option value="paid">已支付</option>
              <option value="delivered">已发货</option>
              <option value="cancelled">已取消</option>
            </Select>
          </Field>
          <form
            className="flex flex-1 items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(queryInput.trim());
              setPage(1);
            }}
          >
            <Field label="订单号或用户名" className="min-w-52 flex-1">
              <TextInput
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="订单号或用户名"
              />
            </Field>
            <Button type="submit" icon={<Search className="h-4 w-4" />}>
              搜索
            </Button>
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                setQueryInput("");
                setSearch("");
                setStatusFilter("");
                setPage(1);
              }}
            >
              重置
            </Button>
          </form>
        </div>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="h-11 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="w-12 px-3"></th>
                <th className="px-3">订单号</th>
                <th className="w-28 px-3">用户</th>
                <th className="w-24 px-3">状态</th>
                <th className="w-28 px-3">金额</th>
                <th className="w-36 px-3">下单时间</th>
                <th className="w-28 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="h-40 text-center">
                    <Spinner className="h-6 w-6 text-slate-400" />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={<ShoppingCart className="h-5 w-5" />} text="暂无订单" />
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const expanded = expandedId === order.id;
                  return (
                    <FragmentRow
                      key={order.id}
                      order={order}
                      expanded={expanded}
                      loadingCards={loadingCards}
                      itemCards={itemCards}
                      actionId={actionId}
                      onToggle={() => toggleExpand(order)}
                      onCancel={() => setConfirmAction({ type: "cancel", order })}
                      onDeliver={() => setConfirmAction({ type: "deliver", order })}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </div>
      </Panel>

      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.type === "deliver" ? "标记发货" : "取消订单"}
        message={
          confirmAction?.type === "deliver"
            ? `确定为订单 ${confirmAction?.order?.order_no} 发货并绑定卡密吗？`
            : `确定取消订单 ${confirmAction?.order?.order_no} 吗？`
        }
        confirmText={confirmAction?.type === "deliver" ? "发货" : "取消订单"}
        danger={confirmAction?.type === "cancel"}
        loading={actionId !== null}
        onConfirm={handleAction}
        onClose={() => setConfirmAction(null)}
      />
    </div>
  );
}

function FragmentRow({
  order,
  expanded,
  loadingCards,
  itemCards,
  actionId,
  onToggle,
  onCancel,
  onDeliver,
}: {
  order: Order;
  expanded: boolean;
  loadingCards: boolean;
  itemCards: Record<number, Card[]>;
  actionId: number | null;
  onToggle: () => void;
  onCancel: () => void;
  onDeliver: () => void;
}) {
  return (
    <>
      <tr className="h-14">
        <td className="px-3">
          <IconButton label={expanded ? "收起明细" : "查看明细"} onClick={onToggle}>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </IconButton>
        </td>
        <td className="px-3">
          <span className="font-mono text-xs text-slate-600">{order.order_no}</span>
        </td>
        <td className="px-3 text-slate-600">{order.username}</td>
        <td className="px-3">
          <OrderStatusBadge status={order.status} />
        </td>
        <td className="px-3 font-medium tabular-nums text-slate-800">
          {formatMoney(order.total_cents)}
        </td>
        <td className="px-3 text-xs tabular-nums text-slate-400">
          {formatTime(order.created_at)}
        </td>
        <td className="px-3">
          <div className="flex items-center justify-end gap-1">
            {order.status === "pending" && (
              <IconButton
                label="取消订单"
                onClick={onCancel}
                disabled={actionId === order.id}
                className="text-red-600 hover:bg-red-50"
              >
                <XCircle className="h-4 w-4" />
              </IconButton>
            )}
            {order.status === "paid" && (
              <IconButton
                label="标记发货"
                onClick={onDeliver}
                disabled={actionId === order.id}
                className="text-emerald-600 hover:bg-emerald-50"
              >
                <Truck className="h-4 w-4" />
              </IconButton>
            )}
            {order.status !== "pending" && order.status !== "paid" && (
              <span className="w-9 text-center text-xs text-slate-300">—</span>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-4">
            <div className="space-y-3">
              {order.items.map((item) => {
                const cards = itemCards[item.id];
                return (
                  <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <img
                        src={item.cover}
                        alt=""
                        className="h-9 w-9 rounded border border-slate-200 bg-slate-100 object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {item.product_name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-600">
                        {item.quantity} × {formatMoney(item.unit_price_cents)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-slate-800">
                        {formatMoney(item.unit_price_cents * item.quantity)}
                      </span>
                    </div>
                    {order.status === "delivered" && (
                      <div className="mt-2 border-t border-slate-100 pt-2">
                        {cards === undefined && loadingCards ? (
                          <div className="flex h-8 items-center gap-2 text-xs text-slate-400">
                            <Spinner className="h-3.5 w-3.5" />
                            加载卡密
                          </div>
                        ) : cards && cards.length > 0 ? (
                          <ul className="space-y-1">
                            {cards.map((card) => (
                              <li
                                key={card.id}
                                className="flex items-center gap-2 font-mono text-xs text-slate-600"
                              >
                                <span className="truncate" title={card.content}>
                                  {card.content}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="h-8 text-xs text-slate-400">—</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {order.remark && (
                <div className="text-xs text-slate-500">
                  <span className="mr-2 font-medium text-slate-600">备注</span>
                  {order.remark}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
