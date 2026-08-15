"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertCircle, Loader2, Lock, ShoppingBag } from "lucide-react";
import { useCart } from "./cart-context";
import { useSession } from "./use-session";
import { useProductRefresh } from "./use-products";
import { formatMoney } from "./format";

export function CheckoutView() {
  const router = useRouter();
  const { entries, hydrated, count } = useCart();
  const { user, loading: authLoading } = useSession();
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const ids = useMemo(() => entries.map((item) => item.productId), [entries]);
  const { products, missing, loading: refreshLoading } = useProductRefresh(ids);

  if (!hydrated || authLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="storefront-skeleton h-7 w-32" />
        <div className="mt-6 space-y-3">
          <div className="storefront-card p-4">
            <div className="storefront-skeleton h-4 w-1/3" />
          </div>
          <div className="storefront-card p-4">
            <div className="storefront-skeleton h-4 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-ink-400">
          <Lock className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">请先登录后再结算</h1>
        <p className="mt-1 text-sm text-ink-500">登录后购物车内容会自动保留</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/auth/login?next=/checkout" className="storefront-btn-primary">
            去登录
          </Link>
          <Link href="/auth/register?next=/checkout" className="storefront-btn-secondary">
            注册账号
          </Link>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-ink-400">
          <ShoppingBag className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">没有待结算的商品</h1>
        <p className="mt-1 text-sm text-ink-500">购物车是空的，先去挑选商品吧</p>
        <Link href="/" className="storefront-btn-primary mt-6">
          去逛逛
        </Link>
      </div>
    );
  }

  const displayTotal = entries.reduce((sum, entry) => {
    const fresh = products.get(entry.productId);
    const price = fresh ? fresh.price_cents : entry.priceCents;
    return sum + price * entry.quantity;
  }, 0);

  async function submitOrder() {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: entries.map((entry) => ({ product_id: entry.productId, quantity: entry.quantity })),
          remark: remark.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { order?: { id: number }; error?: string };
      if (res.status === 401) {
        router.push("/auth/login?next=/checkout");
        return;
      }
      if (!res.ok || !data.order) {
        setError(data.error ?? "下单失败，请稍后重试");
        return;
      }
      router.push(`/pay/${data.order.id}`);
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-bold text-ink-900">确认订单</h1>
      <p className="mt-1 text-sm text-ink-500">价格与库存以下单时服务端核算为准</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-6">
          <section className="storefront-card p-4">
            <h2 className="text-base font-semibold text-ink-900">订单商品</h2>
            <ul className="mt-3 divide-y divide-ink-100">
              {entries.map((entry) => {
                const fresh = products.get(entry.productId);
                const unavailable = missing.has(entry.productId);
                const name = fresh ? fresh.name : entry.name;
                const cover = fresh ? fresh.cover : entry.cover;
                const price = fresh ? fresh.price_cents : entry.priceCents;
                return (
                  <li key={entry.productId} className="flex items-center gap-3 py-3">
                    <img src={cover} alt={name} className="h-16 w-16 shrink-0 rounded-md border border-ink-100 object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{name}</p>
                      <p className="mt-0.5 text-xs text-ink-400">单价 {formatMoney(price)}</p>
                      {unavailable && <p className="mt-1 text-xs text-danger-600">商品已下架，无法结算</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink-800">x {entry.quantity}</p>
                      <p className="mt-0.5 text-sm font-bold text-ink-900">{formatMoney(price * entry.quantity)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="storefront-card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink-900">订单备注</h2>
              <span className="text-xs text-ink-400">{remark.length}/200</span>
            </div>
            <textarea
              className="storefront-input mt-3 min-h-24 resize-y"
              placeholder="选填，可备注发货要求（200 字以内）"
              maxLength={200}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              aria-label="订单备注"
            />
          </section>
        </div>

        <aside className="storefront-card sticky top-24 p-4">
          <h2 className="text-base font-semibold text-ink-900">结算信息</h2>
          <div className="mt-4 space-y-2 border-b border-ink-100 pb-4 text-sm">
            <div className="flex items-center justify-between text-ink-500">
              <span>商品件数</span>
              <span>{count}</span>
            </div>
            <div className="flex items-center justify-between text-ink-500">
              <span>商品金额</span>
              <span>{refreshLoading ? "…" : formatMoney(displayTotal)}</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-ink-600">应付合计</span>
            <span className="text-xl font-bold text-danger-600">{formatMoney(displayTotal)}</span>
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}

          <button type="button" className="storefront-btn-primary mt-4 w-full" disabled={submitting} onClick={submitOrder}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "正在提交…" : "提交订单"}
          </button>
          <p className="mt-3 text-center text-xs text-ink-400">提交后进入收银台完成支付</p>
        </aside>
      </div>
    </div>
  );
}
