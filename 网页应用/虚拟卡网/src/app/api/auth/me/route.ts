import { apiError, json } from "@/lib/api";
import { getSessionUser, publicUser } from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return apiError("未登录", 401);
  return json({ user: publicUser(user) });
}
