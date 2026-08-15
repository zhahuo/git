import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, json } from "@/lib/api";
import { createSessionToken, publicUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import type { User } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    return apiError("用户名或密码错误", 401);
  }
  const token = createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
  return json({ user: publicUser(user) });
}
