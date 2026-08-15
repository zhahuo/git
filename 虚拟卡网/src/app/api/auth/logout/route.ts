import { cookies } from "next/headers";
import { json } from "@/lib/api";
import { deleteSession, SESSION_COOKIE } from "@/lib/auth";

export async function POST() {
  await deleteSession();
  (await cookies()).delete(SESSION_COOKIE);
  return json({ ok: true });
}
