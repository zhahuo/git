import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminNav } from "@/components/admin/nav";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") {
    redirect("/auth/login?next=/admin");
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <AdminNav />
      <main className="mx-auto w-full max-w-7xl px-4 py-6 lg:pl-64">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
