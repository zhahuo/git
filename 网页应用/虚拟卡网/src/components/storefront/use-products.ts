"use client";

import { useEffect, useState } from "react";
import type { StoreProduct } from "./types";

export function useProductRefresh(ids: number[]) {
  const [products, setProducts] = useState<Map<number, StoreProduct>>(new Map());
  const [missing, setMissing] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const key = [...new Set(ids)].sort((a, b) => a - b).join(",");

  useEffect(() => {
    const list = ids.length ? [...new Set(ids)] : [];
    if (list.length === 0) {
      setProducts(new Map());
      setMissing(new Set());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const next = new Map<number, StoreProduct>();
    const nextMissing = new Set<number>();
    Promise.all(
      list.map(async (id) => {
        try {
          const res = await fetch(`/api/products/${id}`, { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as { product: StoreProduct };
            next.set(id, data.product);
          } else {
            nextMissing.add(id);
          }
        } catch {
          nextMissing.add(id);
        }
      })
    ).finally(() => {
      if (!cancelled) {
        setProducts(next);
        setMissing(nextMissing);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // ids 变化由 key 表达，effect 只依赖 key
  }, [key]);

  return { products, missing, loading };
}
