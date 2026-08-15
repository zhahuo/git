"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import type { Category } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
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
  Spinner,
  TextInput,
} from "@/components/admin/ui";

interface CategoryForm {
  name: string;
  slug: string;
  sort_order: string;
}

const emptyForm: CategoryForm = { name: "", slug: "", sort_order: "0" };

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<{ categories: Category[] }>("/api/admin/categories");
      setCategories(data.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载分类失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const openCreate = () => {
    setEditingCategory(null);
    setForm(emptyForm);
    setFormError("");
    setModalOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      slug: category.slug,
      sort_order: String(category.sort_order),
    });
    setFormError("");
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    setFormError("");
    try {
      if (!form.name.trim()) throw new Error("分类名称不能为空");
      const sortOrder = Number(form.sort_order);
      if (!Number.isInteger(sortOrder)) throw new Error("排序值需为整数");
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.trim(),
        sort_order: sortOrder,
      };
      if (editingCategory) {
        await adminFetch(`/api/admin/categories/${editingCategory.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await adminFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setModalOpen(false);
      await loadCategories();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await adminFetch(`/api/admin/categories/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadCategories();
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
        title="分类管理"
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            新增分类
          </Button>
        }
      />

      {error && <Notice message={error} onClose={() => setError("")} />}

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="h-11 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="w-16 px-4">ID</th>
                <th className="px-3">名称</th>
                <th className="px-3">别名</th>
                <th className="w-24 px-3">排序</th>
                <th className="w-24 px-3">商品数</th>
                <th className="w-32 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="h-40 text-center">
                    <Spinner className="h-6 w-6 text-slate-400" />
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={<Tags className="h-5 w-5" />} text="暂无分类" />
                  </td>
                </tr>
              ) : (
                categories.map((category) => (
                  <tr key={category.id} className="h-14">
                    <td className="px-4 tabular-nums text-slate-500">{category.id}</td>
                    <td className="px-3 font-medium text-slate-800">{category.name}</td>
                    <td className="px-3 font-mono text-xs text-slate-500">{category.slug}</td>
                    <td className="px-3 tabular-nums text-slate-600">{category.sort_order}</td>
                    <td className="px-3 tabular-nums text-slate-600">{category.product_count ?? 0}</td>
                    <td className="px-3">
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="编辑"
                          onClick={() => openEdit(category)}
                          className="text-indigo-600 hover:bg-indigo-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="删除"
                          onClick={() => setDeleteTarget(category)}
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
        title={editingCategory ? "编辑分类" : "新增分类"}
        onClose={() => setModalOpen(false)}
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
        <div className="grid gap-4">
          <Field label="分类名称" required>
            <TextInput
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="分类名称"
            />
          </Field>
          <Field label="别名">
            <TextInput
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="留空默认同名称"
            />
          </Field>
          <Field label="排序" required>
            <TextInput
              type="number"
              step="1"
              value={form.sort_order}
              onChange={(event) =>
                setForm((current) => ({ ...current, sort_order: event.target.value }))
              }
            />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除分类"
        message={`确定删除「${deleteTarget?.name ?? ""}」吗？该分类下的商品将变为未分类。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
