"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { StoreProduct } from "./types";

export interface CartEntry {
  productId: number;
  name: string;
  cover: string;
  priceCents: number;
  originalPriceCents: number | null;
  quantity: number;
  stock: number;
  available: boolean;
}

interface CartContextValue {
  entries: CartEntry[];
  count: number;
  totalCents: number;
  hydrated: boolean;
  addItem: (product: StoreProduct, quantity: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  updateEntry: (product: StoreProduct) => void;
  clear: () => void;
}

const STORAGE_KEY = "vc-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

function loadCart(): CartEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartEntry =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CartEntry).productId === "number" &&
        typeof (item as CartEntry).quantity === "number"
    );
  } catch {
    return [];
  }
}

function maxQuantity(stock: number): number {
  return Math.min(99, Math.max(1, stock > 0 ? stock : 99));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setEntries(loadCart());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // localStorage 不可用时购物车仅在内存中保留
    }
  }, [entries, hydrated]);

  const addItem = useCallback((product: StoreProduct, quantity: number) => {
    if (product.stock_count <= 0) return;
    setEntries((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      const wanted = Math.max(1, Math.floor(quantity)) + (existing?.quantity ?? 0);
      const nextQuantity = Math.min(maxQuantity(product.stock_count), wanted);
      const entry: CartEntry = {
        productId: product.id,
        name: product.name,
        cover: product.cover,
        priceCents: product.price_cents,
        originalPriceCents: product.original_price_cents,
        quantity: nextQuantity,
        stock: product.stock_count,
        available: true,
      };
      return existing ? prev.map((item) => (item.productId === product.id ? entry : item)) : [...prev, entry];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setEntries((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const next = Math.min(maxQuantity(item.stock), Math.max(1, Math.floor(quantity)));
        return { ...item, quantity: next };
      })
    );
  }, []);

  const removeItem = useCallback((productId: number) => {
    setEntries((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const updateEntry = useCallback((product: StoreProduct) => {
    setEntries((prev) =>
      prev.map((item) =>
        item.productId === product.id
          ? {
              ...item,
              name: product.name,
              cover: product.cover,
              priceCents: product.price_cents,
              originalPriceCents: product.original_price_cents,
              stock: product.stock_count,
              available: true,
            }
          : item
      )
    );
  }, []);

  const clear = useCallback(() => {
    setEntries([]);
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const count = entries.reduce((sum, item) => sum + item.quantity, 0);
    const totalCents = entries.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
    return {
      entries,
      count,
      totalCents,
      hydrated,
      addItem,
      setQuantity,
      removeItem,
      updateEntry,
      clear,
    };
  }, [entries, hydrated, addItem, setQuantity, removeItem, updateEntry, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart 必须在 CartProvider 内使用");
  return value;
}
