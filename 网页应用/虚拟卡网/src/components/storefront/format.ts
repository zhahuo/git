export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}¥${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "-";
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

export function orderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "待支付",
    paid: "已支付",
    delivered: "已发货",
    cancelled: "已取消",
  };
  return map[status] ?? status;
}
