"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import type { Category, Product } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
import { formatMoney } from "@/components/admin/format";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Select,
  Spinner,
  Textarea,
  TextInput,
} from "@/components/admin/ui";
import { ProductActiveBadge } from "@/components/admin/status";

const COVER_OPTIONS = [
  "/covers/card.svg",
  "/covers/steam.svg",
  "/covers/steam-100.svg",
  "/covers/bilibili.svg",
  "/covers/iqiyi.svg",
  "/covers/tencent.svg",
  "/covers/netease.svg",
  "/covers/qqmusic.svg",
  "/covers/jd.svg",
  "/covers/meituan.svg",
];

interface ProductForm {
  name: string;
  category_id: string;
  price: string;
  original_price: string;
  description: string;
  cover: string;
  stock_alert_threshold: string;
  is_active: boolean;
}

const emptyForm: ProductForm = {
  name: "",
  category_id: "",
  price: "",
  original_price: "",
  description: "",
  cover: "/covers/card.svg",
  stock_alert_threshold: "10",
  is_active: true,
};

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2"
    >
      <span
        className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-indigo-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </span>
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </button>
  );
}

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState({ q: "", categoryId: "", status: "" });
  const [queryInput, setQueryInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const data = await adminFetch<{ categories: Category[] }>("/api/admin/categories");
      setCategories(data.categories);
    } catch {
      // 分类加载失败不阻塞商品列表
    }
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.categoryId) params.set("category_id", filters.categoryId);
      if (filters.status) params.set("status", filters.status);
      const data = await adminFetch<{ products: Product[] }>(`/api/admin/products?${params.toString()}`);
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载商品失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category_id: product.category_id === null ? "" : String(product.category_id),
      price: (product.price_cents / 100).toFixed(2),
      original_price:
        product.original_price_cents === null ? "" : (product.original_price_cents / 100).toFixed(2),
      description: product.description,
      cover: product.cover,
      stock_alert_threshold: String(product.stock_alert_threshold),
      is_active: product.is_active === 1,
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError("");
    try {
      const price = Number(form.price);
      const threshold = Number(form.stock_alert_threshold);
      if (!form.name.trim()) throw new Error("商品名称不能为空");
      if (!Number.isFinite(price) || price < 0) throw new Error("价格需为不小于 0 的数字");
      if (!Number.isInteger(threshold) || threshold < 0) throw new Error("库存预警阈值需为不小于 0 的整数");
      const original = form.original_price === "" ? null : Number(form.original_price);
      if (original !== null && (!Number.isFinite(original) || original < 0)) {
        throw new Error("原价需为不小于 0 的数字");
      }
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        price_cents: Math.round(price * 100),
        original_price_cents: original === null ? null : Math.round(original * 100),
        description: form.description,
        cover: form.cover,
        stock_alert_threshold: threshold,
        is_active: form.is_active ? 1 : 0,
      };
      if (editingProduct) {
        await adminFetch(`/api/admin/products/${editingProduct.id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await adminFetch("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (product: Product) => {
    setBusyId(product.id);
    setError("");
    try {
      await adminFetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: product.is_active === 1 ? 0 : 1 }),
      });
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await adminFetch(`/api/admin/products/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="商品管理"
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            新增商品
          </Button>
        }
      />

      {error && <Notice message={error} onClose={() => setError("")} />}

      <Panel className="mb-4">
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters((current) => ({ ...current, q: queryInput.trim() }));
          }}
        >
          <Field label="搜索" className="min-w-52 flex-1">
            <TextInput
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="搜索名称或描述"
            />
          </Field>
          <Field label="分类" className="w-40">
            <Select
              value={filters.categoryId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, categoryId: event.target.value }))
              }
            >
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="状态" className="w-36">
            <Select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="">全部状态</option>
              <option value="active">上架</option>
              <option value="inactive">下架</option>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="submit" icon={<Search className="h-4 w-4" />}>
              搜索
            </Button>
            <Button
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setQueryInput("");
                setFilters({ q: "", categoryId: "", status: "" });
              }}
            >
              重置
            </Button>
          </div>
        </form>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="h-11 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="w-16 px-4">封面</th>
                <th className="px-3">名称</th>
                <th className="w-28 px-3">分类</th>
                <th className="w-24 px-3">价格</th>
                <th className="w-20 px-3">库存</th>
                <th className="w-20 px-3">销量</th>
                <th className="w-20 px-3">状态</th>
                <th className="w-36 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="h-40 text-center">
                    <Spinner className="h-6 w-6 text-slate-400" />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState icon={<Package className="h-5 w-5" />} text="暂无商品" />
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="h-16">
                    <td className="px-4">
                      <img
                        src={product.cover}
                        alt=""
                        className="h-10 w-10 rounded border border-slate-200 bg-slate-100 object-cover"
                        onError={(event) => {
                          event.currentTarget.style.visibility = "hidden";
                        }}
                      />
                    </td>
                    <td className="px-3">
                      <div className="max-w-64 truncate font-medium text-slate-800">{product.name}</div>
                      {product.stock_count <= product.stock_alert_threshold && (
                        <div className="mt-0.5 text-xs text-amber-600">库存偏低</div>
                      )}
                    </td>
                    <td className="px-3 text-slate-600">{product.category_name ?? "未分类"}</td>
                    <td className="px-3 font-medium tabular-nums text-slate-800">
                      {formatMoney(product.price_cents)}
                    </td>
                    <td className="px-3 tabular-nums text-slate-600">
                      {product.stock_count}
                      <span className="text-xs text-slate-400"> / {product.stock_alert_threshold}</span>
                    </td>
                    <td className="px-3 tabular-nums text-slate-600">{product.sales_count}</td>
                    <td className="px-3">
                      <ProductActiveBadge isActive={product.is_active} />
                    </td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="编辑"
                          onClick={() => openEdit(product)}
                          className="text-indigo-600 hover:bg-indigo-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label={product.is_active === 1 ? "下架" : "上架"}
                          onClick={() => toggleActive(product)}
                          disabled={busyId === product.id}
                        >
                          {product.is_active === 1 ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </IconButton>
                        <IconButton
                          label="删除"
                          onClick={() => setDeleteTarget(product)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal
        open={modalOpen}
        title={editingProduct ? "编辑商品" : "新增商品"}
        onClose={() => setModalOpen(false)}
        wide
        footer={
          <>
            <Button onClick={() => setModalOpen(false)} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSubmit}>
              保存
            </Button>
          </>
        }
      >
        {formError && <Notice message={formError} onClose={() => setFormError("")} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="商品名称" required className="sm:col-span-2">
            <TextInput
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="商品名称"
            />
          </Field>
          <Field label="分类">
            <Select
              value={form.category_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, category_id: event.target.value }))
              }
            >
              <option value="">未分类</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="封面">
            <Select
              value={form.cover}
              onChange={(event) => setForm((current) => ({ ...current, cover: event.target.value }))}
            >
              {COVER_OPTIONS.map((cover) => (
                <option key={cover} value={cover}>
                  {cover.replace("/covers/", "").replace(".svg", "")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="价格（元）" required>
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="0.00"
            />
          </Field>
          <Field label="原价（元）">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={form.original_price}
              onChange={(event) =>
                setForm((current) => ({ ...current, original_price: event.target.value }))
              }
              placeholder="可选"
            />
          </Field>
          <Field label="库存预警阈值" required>
            <TextInput
              type="number"
              min="0"
              step="1"
              value={form.stock_alert_threshold}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  stock_alert_threshold: event.target.value,
                }))
              }
            />
          </Field>
          <Field label="上架销售">
            <div className="flex h-10 items-center">
              <Toggle
                checked={form.is_active}
                label={form.is_active ? "上架" : "下架"}
                onChange={(checked) => setForm((current) => ({ ...current, is_active: checked }))}
              />
            </div>
          </Field>
          <Field label="商品描述" className="sm:col-span-2">
            <Textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="商品描述"
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除商品"
        message={`确定删除「${deleteTarget?.name ?? ""}」吗？未售出的卡密将一并删除。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
