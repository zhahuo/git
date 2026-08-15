"use client";

import { useEffect, useRef, useState } from "react";
import { PackageSearch, Search, X } from "lucide-react";
import type { StoreCategory, StoreProduct } from "./types";
import { useCart } from "./cart-context";
import { ProductCard } from "./product-card";

const SORT_OPTIONS = [
  { value: "newest", label: "最新上架" },
  { value: "sales", label: "销量优先" },
  { value: "price_asc", label: "价格从低到高" },
  { value: "price_desc", label: "价格从高到低" },
];

export function ProductExplorer() {
  const { addItem } = useCart();
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [addedId, setAddedId] = useState<number | null>(null);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/categories", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { categories: StoreCategory[] }) => {
        if (!cancelled) setCategories(data.categories);
      })
      .catch(() => {
        // 分类加载失败不影响商品浏览
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (category) params.set("category", category);
    if (sort !== "newest") params.set("sort", sort);
    setLoading(true);
    setError("");
    fetch(`/api/products?${params.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("加载失败");
        const data = (await res.json()) as { products: StoreProduct[] };
        setProducts(data.products);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("商品加载失败，请稍后重试");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, category, sort]);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  }

  function handleAdd(product: StoreProduct) {
    addItem(product, 1);
    setAddedId(product.id);
    window.setTimeout(() => setAddedId((id) => (id === product.id ? null : id)), 1200);
    showToast(`已加入购物车：${product.name}`);
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-900">全部商品</h1>
          <p className="mt-1 text-sm text-ink-500">官方直供虚拟卡密，付款后自动发货</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-600">
          <span className="shrink-0">排序</span>
          <select
            className="storefront-input w-auto py-2"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            aria-label="商品排序"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            className="storefront-input pl-9 pr-9"
            type="search"
            placeholder="搜索商品名称或描述"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="搜索商品"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="清空搜索"
              onClick={() => setQuery("")}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:ml-2 lg:flex-wrap lg:overflow-visible lg:pb-0" role="tablist" aria-label="商品分类">
          <button
            type="button"
            role="tab"
            aria-selected={category === ""}
            className={`storefront-chip ${category === "" ? "storefront-chip-active" : ""}`}
            onClick={() => setCategory("")}
          >
            全部
          </button>
          {categories.map((item) => (
            <button
              type="button"
              role="tab"
              key={item.id}
              aria-selected={category === item.slug || category === item.name}
              className={`storefront-chip ${category === item.slug || category === item.name ? "storefront-chip-active" : ""}`}
              onClick={() => setCategory(item.slug)}
            >
              {item.name}
              {typeof item.product_count === "number" && (
                <span className={category === item.slug || category === item.name ? "text-white/80" : "text-ink-400"}>
                  {item.product_count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-5 text-sm text-ink-500" aria-live="polite">
        {loading ? "正在加载商品…" : `共 ${products.length} 件商品`}
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-600">{error}</div>
      )}

      {!error && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy={loading}>
          {loading
            ? Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="storefront-card overflow-hidden">
                  <div className="storefront-skeleton aspect-[4/3]" />
                  <div className="space-y-2 p-3">
                    <div className="storefront-skeleton h-4 w-1/3" />
                    <div className="storefront-skeleton h-4 w-4/5" />
                    <div className="storefront-skeleton h-5 w-1/2" />
                    <div className="storefront-skeleton h-8 w-full" />
                  </div>
                </div>
              ))
            : products.length === 0 && (
                <div className="col-span-full mt-8 flex flex-col items-center justify-center py-14 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-100 text-ink-400">
                    <PackageSearch className="h-7 w-7" />
                  </span>
                  <h2 className="mt-4 text-base font-semibold text-ink-800">没有找到匹配的商品</h2>
                  <p className="mt-1 text-sm text-ink-500">换个关键词或分类试试</p>
                </div>
              )}
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} added={addedId === product.id} onAdd={handleAdd} />
          ))}
        </div>
      )}

      {toast && (
        <div className="storefront-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
