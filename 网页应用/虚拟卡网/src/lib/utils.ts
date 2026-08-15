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

export function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value.includes("T") ? value : `${value}Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function yuanToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function orderNo(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `VC${Date.now()}${rand}`;
}

export function paymentNo(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PAY${Date.now()}${rand}`;
}

export function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}…` : text;
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
