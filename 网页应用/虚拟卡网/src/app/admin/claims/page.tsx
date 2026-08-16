"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Receipt, RefreshCw, Search } from "lucide-react";
import type { Product } from "@/lib/types";
import { adminFetch } from "@/components/admin/api";
import { formatTime } from "@/components/admin/format";
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Panel,
  Select,
  Spinner,
  TextInput,
} from "@/components/admin/ui";

const PAGE_SIZE = 50;

interface Claim {
  id: number;
  claim_no: string;
  external_order_no: string | null;
  product_id: number;
  product_name: string | null;
  quantity: number;
  card_ids: string;
  created_at: string;
}

interface ClaimsResponse {
  claims: Claim[];
  total: number;
}

function parseCardIds(value: string): Array<number | string> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

export default function AdminClaimsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewClaim, setViewClaim] = useState<Claim | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const data = await adminFetch<{ products: Product[] }>("/api/admin/products");
      setProducts(data.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载商品失败");
    }
  }, []);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      });
      if (selectedProductId) params.set("product_id", selectedProductId);
      if (search) params.set("external_order_no", search);
      const data = await adminFetch<ClaimsResponse>(
        `/api/admin/integration/claims?${params.toString()}`
      );
      setClaims(data.claims);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载发卡记录失败");
    } finally {
      setLoading(false);
    }
  }, [selectedProductId, search, page]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <PageHeader title="发卡记录" />

      {error && <Notice message={error} onClose={() => setError("")} />}

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label="商品" className="w-56">
            <Select
              value={selectedProductId}
              onChange={(event) => {
                setSelectedProductId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">全部商品</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
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
            <Field label="外部订单号" className="min-w-52 flex-1">
              <TextInput
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="输入外部订单号"
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
                setSelectedProductId("");
                setPage(1);
              }}
            >
              重置
            </Button>
          </form>
        </div>
      </Panel>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="h-11 border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="w-40 px-4">时间</th>
                <th className="w-48 px-3">流水号</th>
                <th className="w-44 px-3">外部订单号</th>
                <th className="px-3">商品</th>
                <th className="w-16 px-3">数量</th>
                <th className="w-36 px-3">卡密 ID</th>
                <th className="w-20 px-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="h-40 text-center">
                    <Spinner className="h-6 w-6 text-slate-400" />
                  </td>
                </tr>
              ) : claims.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState icon={<Receipt className="h-5 w-5" />} text="暂无发卡记录" />
                  </td>
                </tr>
              ) : (
                claims.map((claim) => (
                  <tr key={claim.id} className="h-14">
                    <td className="px-4 text-xs tabular-nums text-slate-500">
                      {formatTime(claim.created_at)}
                    </td>
                    <td className="px-3">
                      <span className="font-mono text-xs text-slate-700">{claim.claim_no}</span>
                    </td>
                    <td className="px-3">
                      {claim.external_order_no ? (
                        <span className="block max-w-40 truncate font-mono text-xs text-slate-600" title={claim.external_order_no}>
                          {claim.external_order_no}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3">
                      <span className="block max-w-52 truncate text-slate-700" title={claim.product_name ?? ""}>
                        {claim.product_name || `商品 #${claim.product_id}`}
                      </span>
                    </td>
                    <td className="px-3 tabular-nums text-slate-600">{claim.quantity}</td>
                    <td className="px-3">
                      <span className="block truncate font-mono text-xs tabular-nums text-slate-600">
                        {parseCardIds(claim.card_ids).join(", ")}
                      </span>
                    </td>
                    <td className="px-3">
                      <div className="flex items-center justify-end">
                        <IconButton
                          label="查看 JSON"
                          onClick={() => setViewClaim(claim)}
                          className="text-indigo-600 hover:bg-indigo-50"
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
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

      <Modal
        open={viewClaim !== null}
        title={viewClaim ? `发卡记录 ${viewClaim.claim_no}` : "发卡记录"}
        onClose={() => setViewClaim(null)}
        wide
        footer={
          <Button onClick={() => setViewClaim(null)}>关闭</Button>
        }
      >
        {viewClaim && (
          <pre className="max-h-[60vh] overflow-auto rounded-md bg-slate-900 p-4 text-xs leading-5 text-slate-100">
            {JSON.stringify(viewClaim, null, 2)}
          </pre>
        )}
      </Modal>
    </div>
  );
}
