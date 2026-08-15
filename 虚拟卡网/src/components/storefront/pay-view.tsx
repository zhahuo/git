"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Copy,
  CreditCard,
  Lock,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { useCart } from "./cart-context";
import { formatMoney, orderStatusLabel } from "./format";
import type { Card, Order } from "./types";

interface PayViewProps {
  orderId: string;
}

export function PayView({ orderId }: PayViewProps) {
  const router = useRouter();
  const { clear } = useCart();
  const [order, setOrder] = useState<Order | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [method, setMethod] = useState<"mock" | "balance">("mock");
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const [cards, setCards] = useState<Card[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const redirectTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [orderRes, balanceRes] = await Promise.all([
          fetch(`/api/orders/${orderId}`, { cache: "no-store" }),
          fetch("/api/balance", { cache: "no-store" }),
        ]);
        if (orderRes.status === 401) {
          setNeedLogin(true);
          return;
        }
        if (!orderRes.ok) {
          setNotFound(true);
          return;
        }
        const orderData = (await orderRes.json()) as { order: Order };
        if (!cancelled) {
          setOrder(orderData.order);
          if (orderData.order.status === "delivered") {
            setPaid(true);
            setCards(orderData.order.items.flatMap((item) => item.cards ?? []));
          }
        }
        if (balanceRes.ok) {
          const balanceData = (await balanceRes.json()) as { balance_cents: number };
          if (!cancelled) setBalanceCents(balanceData.balance_cents);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (redirectTimer.current) window.clearTimeout(redirectTimer.current);
    };
  }, [orderId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="storefront-skeleton h-7 w-32" />
        <div className="storefront-skeleton mt-6 h-52" />
      </div>
    );
  }

  if (needLogin) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-ink-400">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">请先登录</h1>
        <p className="mt-1 text-sm text-ink-500">登录后即可查看订单并完成支付</p>
        <Link href={`/auth/login?next=/pay/${orderId}`} className="storefront-btn-primary mt-6">
          去登录
        </Link>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-ink-400">
          <AlertCircle className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">订单不存在</h1>
        <Link href="/" className="storefront-btn-primary mt-6">
          返回首页
        </Link>
      </div>
    );
  }

  const canPay = order.status === "pending";
  const balanceEnough = balanceCents !== null && balanceCents >= order.total_cents;
  const totalCards = order.items.reduce((sum, item) => sum + item.quantity, 0);

  function handleCopy(card: Card) {
    void navigator.clipboard.writeText(card.content);
    setCopiedId(card.id);
    window.setTimeout(() => setCopiedId((id) => (id === card.id ? null : id)), 1500);
  }

  async function submitPayment() {
    if (!canPay || paying) return;
    setPaying(true);
    setError("");
    try {
      const res = await fetch(`/api/payments/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      const data = (await res.json().catch(() => ({}))) as { order?: Order; cards?: Card[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "支付失败，请稍后重试");
        return;
      }
      clear();
      setPaid(true);
      setCards(data.cards ?? []);
      setOrder(data.order ?? order);
      redirectTimer.current = window.setTimeout(() => {
        router.push(`/account/orders/${orderId}`);
      }, 2200);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="storefront-card p-6 text-center sm:p-8">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-50 text-success-500">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-ink-900">支付成功，已自动发货</h1>
          <p className="mt-2 text-sm text-ink-500">
            订单 {order.order_no} · 共 {totalCards} 张卡密，请妥善保存
          </p>

          <div className="mt-6 space-y-3 text-left">
            {cards.length === 0 ? (
              <p className="rounded-lg bg-ink-50 px-4 py-3 text-sm text-ink-500">卡密已发放，可在订单详情中查看</p>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success-100 bg-success-50 px-4 py-3"
                >
                  <code className="min-w-0 flex-1 break-all font-mono text-sm font-semibold text-ink-800">{card.content}</code>
                  <button
                    type="button"
                    className="storefront-btn-secondary storefront-btn-sm"
                    onClick={() => handleCopy(card)}
                  >
                    <Copy className="h-4 w-4" />
                    {copiedId === card.id ? "已复制" : "复制卡密"}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href={`/account/orders/${orderId}`} className="storefront-btn-primary">
              查看订单详情
            </Link>
            <Link href="/" className="storefront-btn-secondary">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link
        href={order.status === "pending" ? "/cart" : "/"}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </Link>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <section className="storefront-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3">
            <div>
              <h1 className="text-lg font-bold text-ink-900">收银台</h1>
              <p className="mt-0.5 text-xs text-ink-400">订单号 {order.order_no}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <ul className="divide-y divide-ink-100">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <img
                  src={item.cover}
                  alt={item.product_name}
                  className="h-14 w-14 shrink-0 rounded-md border border-ink-100 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.product_name}</p>
                  <p className="mt-0.5 text-xs text-ink-400">x {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold text-ink-800">{formatMoney(item.unit_price_cents * item.quantity)}</p>
              </li>
            ))}
          </ul>

          {order.remark && (
            <p className="rounded-lg bg-ink-50 px-3 py-2.5 text-sm text-ink-600">
              备注：{order.remark}
            </p>
          )}
        </section>

        <aside className="storefront-card sticky top-24 p-4">
          <h2 className="text-base font-semibold text-ink-900">选择支付方式</h2>

          <div className="mt-4 space-y-3">
            <button
              type="button"
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                method === "mock"
                  ? "border-brand-500 bg-brand-50"
                  : "border-ink-200 hover:border-brand-300"
              }`}
              onClick={() => setMethod("mock")}
            >
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900">模拟支付</span>
                <span className="mt-0.5 block text-xs text-ink-500">演示环境专用，不扣余额，立即发货</span>
              </span>
              <RadioDot active={method === "mock"} />
            </button>

            <button
              type="button"
              disabled={!balanceEnough}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                method === "balance" ? "border-brand-500 bg-brand-50" : "border-ink-200 hover:border-brand-300"
              }`}
              onClick={() => setMethod("balance")}
            >
              <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink-900">余额支付</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  {balanceCents === null ? "余额加载中…" : `账户余额 ${formatMoney(balanceCents)}`}
                  {balanceCents !== null && !balanceEnough ? " · 余额不足" : ""}
                </span>
              </span>
              <RadioDot active={method === "balance"} />
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-ink-100 pt-4">
            <span className="text-sm text-ink-600">应付合计</span>
            <span className="text-xl font-bold text-danger-600">{formatMoney(order.total_cents)}</span>
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="button"
            className="storefront-btn-primary mt-4 w-full"
            disabled={!canPay || paying || (method === "balance" && !balanceEnough)}
            onClick={submitPayment}
          >
            {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            {paying ? "正在支付…" : method === "balance" ? `余额支付 ${formatMoney(order.total_cents)}` : `模拟支付 ${formatMoney(order.total_cents)}`}
          </button>

          {!canPay && (
            <p className="mt-3 text-center text-xs text-ink-400">当前订单状态：{orderStatusLabel(order.status)}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
        active ? "border-brand-500" : "border-ink-300"
      }`}
    >
      {active && <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />}
    </span>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], string> = {
    pending: "bg-warning-50 text-warning-600",
    paid: "bg-brand-50 text-brand-700",
    delivered: "bg-success-50 text-success-600",
    cancelled: "bg-ink-100 text-ink-500",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${map[status]}`}>{orderStatusLabel(status)}</span>
  );
}
