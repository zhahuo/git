import { json } from "@/lib/api";

export function GET() {
  return json({ ok: true, service: "虚拟卡网", time: new Date().toISOString() });
}
