import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

export default async function RequireAuth({ next, children }: { next: string; children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }
  return children;
}
