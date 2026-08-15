"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, KeyRound, Layers, Lock, PackageCheck, RefreshCw, Search, Trash2 } from "lucide-react";
import type { Card, Product } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
import { formatTime } from "@/components/admin/format";
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
  Textarea,
  TextInput,
} from "@/components/admin/ui";
import { CardStatusBadge } from "@/components/admin/status";

const PAGE_SIZE = 50;

export default function AdminCardsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [allTotal, setAllTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importing, setImporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Card | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const data = await adminFetch<{ products: Product[] }>("/api/admin/products");
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载商品失败");
    }
  }, []);

  const loadCards = useCallback(async () => {
    if (!selectedProductId) {
      setCards([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        product_id: selectedProductId,
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("q", search);
      const data = await adminFetch<{ cards: Card[]; total: number }>(
        `/api/admin/cards?${params.toString()}`
      );
      setCards(data.cards);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载卡密失败");
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, statusFilter, search, page]);

  const loadStockTotal = useCallback(async (productId: string) => {
    try {
      const data = await adminFetch<{ total: number }>(
        `/api/admin/cards?product_id=${productId}&limit=1`
      );
      setAllTotal(data.total);
    } catch {
      setAllTotal(0);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (products.length > 0) {
      setSelectedProductId((current) => current || String(products[0].id));
    }
  }, [products]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  useEffect(() => {
    if (selectedProductId) {
      loadStockTotal(selectedProductId);
    }
  }, [selectedProductId, loadStockTotal]);

  const selectedProduct = products.find((product) => String(product.id) === selectedProductId);

  const handleImport = async () => {
    if (!selectedProductId) return;
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      setError("请输入卡密内容");
      return;
    }
    setImporting(true);
    setError("");
    setSuccess("");
    try {
      const data = await adminFetch<{ imported: number; skipped: number }>("/api/admin/cards", {
        method: "POST",
        body: JSON.stringify({ product_id: Number(selectedProductId), content }),
      });
      setSuccess(`导入 ${data.imported} 条，跳过 ${data.skipped} 条`);
      setContent("");
      await Promise.all([loadCards(), loadStockTotal(selectedProductId), loadProducts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await adminFetch(`/api/admin/cards/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setSuccess("卡密已删除");
      await Promise.all([loadCards(), loadStockTotal(selectedProductId), loadProducts()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="卡密管理" />

      {error && <Notice message={error} onClose={() => setError("")} />}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <PackageCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
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
        <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Field label="选择商品">
            <Select
              value={selectedProductId}
              onChange={(event) => {
                setSelectedProductId(event.target.value);
                setPage(1);
                setStatusFilter("");
                setQueryInput("");
                setSearch("");
              }}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex h-24 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <PackageCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                可用
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                {selectedProduct?.stock_count ?? 0}
              </div>
            </div>
            <div className="flex h-24 flex-col justify-center rounded-md border border-slate-200 bg-slate-50 px-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Layers className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                总数
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{allTotal}</div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
            <FileUp className="h-4 w-4 text-indigo-600" aria-hidden="true" />
            批量导入
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="每行一条卡密"
              className="min-h-24 flex-1 lg:min-h-24"
            />
            <Button
              variant="primary"
              loading={importing}
              icon={<FileUp className="h-4 w-4" />}
              onClick={handleImport}
              className="h-10 shrink-0"
            >
              导入
            </Button>
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="状态" className="w-36">
            <Select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部状态</option>
              <option value="available">可用</option>
              <option value="sold">已售</option>
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
            <Field label="搜索卡密内容" className="min-w-48 flex-1">
              <TextInput
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="输入卡密内容"
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

        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px] border-collapse text-sm">
            <thead>
              <tr className="h-11 border-y border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4">卡密内容</th>
                <th className="w-40 px-3">商品</th>
                <th className="w-20 px-3">状态</th>
                <th className="w-24 px-3">绑定明细</th>
                <th className="w-36 px-3">导入时间</th>
                <th className="w-20 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="h-40 text-center">
                    <Spinner className="h-6 w-6 text-slate-400" />
                  </td>
                </tr>
              ) : cards.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={<KeyRound className="h-5 w-5" />} text="暂无卡密" />
                  </td>
                </tr>
              ) : (
                cards.map((card) => (
                  <tr key={card.id} className="h-14">
                    <td className="max-w-64 px-4">
                      <span className="block truncate font-mono text-xs text-slate-700" title={card.content}>
                        {card.content}
                      </span>
                    </td>
                    <td className="px-3">
                      <span className="block max-w-36 truncate text-slate-600" title={card.product_name}>
                        {card.product_name}
                      </span>
                    </td>
                    <td className="px-3">
                      <CardStatusBadge status={card.status} />
                    </td>
                    <td className="px-3 tabular-nums text-slate-500">
                      {card.order_item_id === null ? "—" : card.order_item_id}
                    </td>
                    <td className="px-3 text-xs tabular-nums text-slate-400">
                      {formatTime(card.created_at)}
                    </td>
                    <td className="px-3">
                      <div className="flex items-center justify-end">
                        {card.status === "available" ? (
                          <IconButton
                            label="删除"
                            onClick={() => setDeleteTarget(card)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        ) : (
                          <IconButton label="已售出不可删除" disabled>
                            <Lock className="h-4 w-4" />
                          </IconButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 pb-4">
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </div>
      </Panel>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除卡密"
        message="确定删除这条卡密吗？删除后不可恢复。"
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
