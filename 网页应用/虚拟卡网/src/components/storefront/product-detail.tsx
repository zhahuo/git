"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Minus, PackageX, Plus, ShieldCheck, ShoppingCart, Zap } from "lucide-react";
import { useCart } from "./cart-context";
import { formatMoney } from "./format";
import type { StoreProduct } from "./types";

export function ProductDetail({ productId }: { productId: string }) {
  const { addItem } = useCart();
  const router = useRouter();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setProduct(null);
    setQuantity(1);
    fetch(`/api/products/${productId}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as { product: StoreProduct };
        setProduct(data.product);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="storefront-skeleton h-5 w-28" />
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div className="storefront-skeleton aspect-square" />
          <div className="space-y-4">
            <div className="storefront-skeleton h-6 w-3/4" />
            <div className="storefront-skeleton h-4 w-1/3" />
            <div className="storefront-skeleton h-10 w-2/3" />
            <div className="storefront-skeleton h-24 w-full" />
            <div className="storefront-skeleton h-10 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 text-center sm:px-6">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-ink-400">
          <PackageX className="h-8 w-8" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">商品不存在或已下架</h1>
        <p className="mt-1 text-sm text-ink-500">该商品可能已下架，去商城看看其他商品吧</p>
        <Link href="/" className="storefront-btn-primary mt-6">
          <ArrowLeft className="h-4 w-4" />
          返回商品列表
        </Link>
      </div>
    );
  }

  const soldOut = product.stock_count <= 0;
  const maxQuantity = Math.min(99, Math.max(1, product.stock_count));
  const lowStock = !soldOut && product.stock_count <= product.stock_alert_threshold;
  const currentProduct = product;

  function handleAdd() {
    addItem(currentProduct, quantity);
    setAdded(true);
    setToast(`已加入购物车：${currentProduct.name}`);
    window.setTimeout(() => setAdded(false), 1500);
    window.setTimeout(() => setToast(""), 1800);
  }

  function handleBuyNow() {
    addItem(currentProduct, quantity);
    router.push("/checkout");
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" />
        返回商品列表
      </Link>

      <div className="mt-5 grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
          <img src={product.cover} alt={product.name} className="aspect-[4/3] h-full w-full object-cover" />
        </div>

        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              {product.category_name ?? "未分类"}
            </span>
            {soldOut ? (
              <span className="rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">已售罄</span>
            ) : lowStock ? (
              <span className="rounded bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-600">库存紧张</span>
            ) : null}
          </div>

          <h1 className="mt-3 text-lg font-bold leading-6 text-ink-900 sm:text-xl sm:leading-7">{product.name}</h1>

          <div className="mt-4 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3">
            <p className="text-xl font-bold text-danger-600">{formatMoney(product.price_cents)}</p>
            {product.original_price_cents && product.original_price_cents > product.price_cents && (
              <p className="mt-0.5 text-sm text-ink-400 line-through">{formatMoney(product.original_price_cents)}</p>
            )}
          </div>

          <p className="mt-4 text-sm leading-6 text-ink-600">{product.description}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
            <span>库存 {product.stock_count} 件</span>
            <span>已售 {product.sales_count} 件</span>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="text-sm font-medium text-ink-700">数量</span>
            <div className="inline-flex items-center rounded-lg border border-ink-300">
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                aria-label="减少数量"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                className="h-10 w-14 border-x border-ink-200 text-center text-sm font-semibold outline-none"
                type="number"
                min={1}
                max={maxQuantity}
                value={quantity}
                aria-label="购买数量"
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  if (Number.isNaN(value)) return;
                  setQuantity(Math.min(maxQuantity, Math.max(1, value)));
                }}
              />
              <button
                type="button"
                className="grid h-10 w-10 place-items-center text-ink-600 hover:bg-ink-100 disabled:opacity-40"
                aria-label="增加数量"
                disabled={quantity >= maxQuantity}
                onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-xs text-ink-400">单笔最多 {maxQuantity} 件</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" className="storefront-btn-secondary" disabled={soldOut} onClick={handleAdd}>
              {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
              {added ? "已加入购物车" : "加入购物车"}
            </button>
            <button type="button" className="storefront-btn-primary" disabled={soldOut} onClick={handleBuyNow}>
              <Zap className="h-4 w-4" />
              立即购买
            </button>
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-lg bg-ink-50 px-3 py-2.5 text-xs leading-5 text-ink-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
            支付成功后自动发货，卡密只发放一次，请妥善保存。
          </div>
        </div>
      </div>

      {toast && (
        <div className="storefront-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
