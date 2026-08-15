import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiError, json } from "@/lib/api";
import { createSessionToken, publicUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { User } from "@/lib/types";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const nickname = typeof body?.nickname === "string" ? body.nickname.trim() : "";

  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return apiError("用户名需为 3-20 位字母、数字或下划线", 400);
  }
  if (password.length < 6 || password.length > 32) {
    return apiError("密码长度需为 6-32 位", 400);
  }
  if (nickname && (nickname.length < 2 || nickname.length > 20)) {
    return apiError("昵称长度需为 2-20 位", 400);
  }

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return apiError("用户名已被注册", 409);

  const result = db
    .prepare("INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)")
    .run(username, hashPassword(password), nickname || username);
  const userId = Number(result.lastInsertRowid);
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as unknown as User;
  const token = createSessionToken(userId);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());

  return json({ user: publicUser(user) }, 201);
}
