"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "./cart-context";
import { useSession } from "./use-session";
import { useProductRefresh } from "./use-products";
import { formatMoney } from "./format";

export function CartView() {
  const router = useRouter();
  const { entries, hydrated, setQuantity, removeItem, clear, count, totalCents } = useCart();
  const { user, loading: authLoading } = useSession();
  const ids = useMemo(() => entries.map((item) => item.productId), [entries]);
  const { products, missing, loading: refreshLoading } = useProductRefresh(ids);

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="storefront-skeleton h-7 w-32" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="storefront-card flex gap-4 p-3">
                <div className="storefront-skeleton h-24 w-24 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="storefront-skeleton h-4 w-2/3" />
                  <div className="storefront-skeleton h-4 w-1/3" />
                </div>
              </div>
            ))}
          </div>
          <div className="storefront-skeleton h-40" />
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
        <h1 className="mt-4 text-lg font-semibold text-ink-900">购物车还是空的</h1>
        <p className="mt-1 text-sm text-ink-500">去商城挑选喜欢的虚拟卡密吧</p>
        <Link href="/" className="storefront-btn-primary mt-6">
          去逛逛
        </Link>
      </div>
    );
  }

  function handleCheckout() {
    if (authLoading) return;
    if (!user) {
      router.push("/auth/login?next=/checkout");
      return;
    }
    router.push("/checkout");
  }

  const displayTotal = entries.reduce((sum, entry) => {
    const fresh = products.get(entry.productId);
    const price = fresh ? fresh.price_cents : entry.priceCents;
    return sum + price * entry.quantity;
  }, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink-900">购物车</h1>
          <p className="mt-1 text-sm text-ink-500">共 {count} 件商品</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
          onClick={() => {
            if (window.confirm("确定清空购物车吗？")) clear();
          }}
        >
          <Trash2 className="h-4 w-4" />
          清空购物车
        </button>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-3">
          {entries.map((entry) => {
            const fresh = products.get(entry.productId);
            const unavailable = missing.has(entry.productId);
            const name = fresh ? fresh.name : entry.name;
            const cover = fresh ? fresh.cover : entry.cover;
            const price = fresh ? fresh.price_cents : entry.priceCents;
            const stock = fresh ? fresh.stock_count : entry.stock;
            const lowStock = !unavailable && stock > 0 && entry.quantity > stock;

            return (
              <article key={entry.productId} className="storefront-card flex gap-4 p-3">
                <Link href={`/products/${entry.productId}`} className="shrink-0">
                  <img
                    src={cover}
                    alt={name}
                    className="h-24 w-24 rounded-md border border-ink-100 object-cover sm:h-28 sm:w-28"
                  />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/products/${entry.productId}`}>
                      <h2 className="line-clamp-2 text-sm font-semibold text-ink-900 hover:text-brand-700">{name}</h2>
                    </Link>
                    <button
                      type="button"
                      className="storefront-icon-btn -mr-2 -mt-1 h-8 w-8 shrink-0"
                      title="删除"
                      aria-label={`删除 ${name}`}
                      onClick={() => removeItem(entry.productId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-2 text-sm font-semibold text-danger-600">{formatMoney(price)}</div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                    <div className="inline-flex items-center rounded-lg border border-ink-300">
                      <button
                        type="button"
                        className="grid h-9 w-9 place-items-center text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                        aria-label="减少数量"
                        disabled={entry.quantity <= 1}
                        onClick={() => setQuantity(entry.productId, entry.quantity - 1)}
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-semibold">{entry.quantity}</span>
                      <button
                        type="button"
                        className="grid h-9 w-9 place-items-center text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                        aria-label="增加数量"
                        disabled={stock > 0 && entry.quantity >= stock}
                        onClick={() => setQuantity(entry.productId, entry.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-ink-400">小计</span>
                      <p className="text-sm font-bold text-ink-900">{formatMoney(price * entry.quantity)}</p>
                    </div>
                  </div>

                  {(unavailable || lowStock) && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-warning-600">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {unavailable ? "商品已下架，无法结算" : `当前库存仅剩 ${stock} 件，请调整数量`}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        <aside className="storefront-card sticky top-24 p-4">
          <h2 className="text-base font-semibold text-ink-900">订单合计</h2>
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
          <button type="button" className="storefront-btn-primary mt-4 w-full" disabled={authLoading} onClick={handleCheckout}>
            去结算
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-center text-xs text-ink-400">未登录将先跳转登录页</p>
        </aside>
      </div>
    </div>
  );
}
