import { Badge } from "./ui";

const orderStatusMap: Record<string, { label: string; tone: "green" | "amber" | "blue" | "gray" }> = {
  pending: { label: "待支付", tone: "amber" },
  paid: { label: "已支付", tone: "blue" },
  delivered: { label: "已发货", tone: "green" },
  cancelled: { label: "已取消", tone: "gray" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const item = orderStatusMap[status] ?? { label: status, tone: "gray" as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export function CardStatusBadge({ status }: { status: string }) {
  if (status === "available") return <Badge tone="green">可用</Badge>;
  return <Badge tone="gray">已售</Badge>;
}

export function ProductActiveBadge({ isActive }: { isActive: number }) {
  return isActive === 1 ? <Badge tone="green">上架</Badge> : <Badge tone="gray">下架</Badge>;
}
