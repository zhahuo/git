import { BALANCE_TYPE_META, ORDER_STATUS_META } from "./format";
import type { Order } from "@/lib/types";

export function StatusBadge({ status }: { status: Order["status"] }) {
  const meta = ORDER_STATUS_META[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function BalanceTypeBadge({ type }: { type: string }) {
  const meta = BALANCE_TYPE_META[type] ?? {
    label: type,
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}
