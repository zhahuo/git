import type { Order } from "@/lib/types";

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

export function formatSignedCents(cents: number): string {
  const sign = cents > 0 ? "+" : "";
  return `${sign}${formatCents(cents)}`;
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export const ORDER_STATUS_META: Record<Order["status"], { label: string; className: string }> = {
  pending: { label: "待支付", className: "bg-amber-50 text-amber-700 ring-amber-200" },
  paid: { label: "已支付", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  delivered: { label: "已发货", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  cancelled: { label: "已取消", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const BALANCE_TYPE_META: Record<string, { label: string; className: string }> = {
  recharge: { label: "充值", className: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  consume: { label: "消费", className: "bg-sky-50 text-sky-700 ring-sky-200" },
  refund: { label: "退款", className: "bg-violet-50 text-violet-700 ring-violet-200" },
  adjust: { label: "调整", className: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export function safeNext(value: string | null | undefined): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/account";
}
