"use client";

import Link from "next/link";
import { Check, ShoppingCart } from "lucide-react";
import type { StoreProduct } from "./types";
import { formatMoney } from "./format";

interface ProductCardProps {
  product: StoreProduct;
  added: boolean;
  onAdd: (product: StoreProduct) => void;
}

export function ProductCard({ product, added, onAdd }: ProductCardProps) {
  const soldOut = product.stock_count <= 0;

  return (
    <article className="storefront-card group flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/products/${product.id}`} className="block">
        <div className="relative h-32 overflow-hidden bg-ink-100 sm:h-36">
          <img
            src={product.cover}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {soldOut && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/45 text-sm font-semibold text-white">
              已售罄
            </div>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="max-w-[60%] truncate rounded bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
            {product.category_name ?? "未分类"}
          </span>
          <span className="text-xs text-ink-400">已售 {product.sales_count}</span>
        </div>
        <Link href={`/products/${product.id}`} className="min-h-10">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-ink-900 transition-colors group-hover:text-brand-700">
            {product.name}
          </h3>
        </Link>
        <div className="mt-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-bold leading-5 text-danger-600">{formatMoney(product.price_cents)}</p>
            {product.original_price_cents && product.original_price_cents > product.price_cents && (
              <p className="text-xs text-ink-400 line-through">{formatMoney(product.original_price_cents)}</p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink-100 pt-3">
          <span className="text-xs text-ink-500">库存 {product.stock_count}</span>
          <button
            type="button"
            className={`storefront-btn-primary storefront-btn-sm ${soldOut ? "storefront-btn-soldout" : ""}`}
            disabled={soldOut}
            onClick={() => onAdd(product)}
          >
            {added ? <Check className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}
            {soldOut ? "已售罄" : added ? "已加入" : "加入购物车"}
          </button>
        </div>
      </div>
    </article>
  );
}
