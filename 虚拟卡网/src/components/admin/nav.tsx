"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Package,
  ShieldCheck,
  ShoppingCart,
  Tags,
} from "lucide-react";

const items = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/products", label: "商品", icon: Package },
  { href: "/admin/categories", label: "分类", icon: Tags },
  { href: "/admin/cards", label: "卡密", icon: KeyRound },
  { href: "/admin/orders", label: "订单", icon: ShoppingCart },
];

export function AdminNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <>
      <aside className="fixed left-0 top-16 z-30 hidden h-[calc(100vh-4rem)] w-56 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-5 text-slate-900">
          <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <span className="text-base font-semibold">管理后台</span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <Link
            href="/"
            className="flex h-9 items-center gap-2.5 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>返回商城</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <header className="sticky top-16 z-30 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex h-12 items-center gap-2 border-b border-slate-200 px-4 text-slate-900">
          <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <span className="text-base font-semibold">管理后台</span>
          <button
            type="button"
            onClick={logout}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
            aria-label="退出登录"
            title="退出登录"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 py-1.5">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
