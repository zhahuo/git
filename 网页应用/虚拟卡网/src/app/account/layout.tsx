"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ShoppingBag, Ticket, Wallet } from "lucide-react";

const NAV_ITEMS = [
  { href: "/account", label: "概览", icon: LayoutDashboard },
  { href: "/account/orders", label: "我的订单", icon: ShoppingBag },
  { href: "/account/cards", label: "我的卡密", icon: Ticket },
  { href: "/account/balance", label: "余额记录", icon: Wallet },
];

export default function AccountLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
        <aside>
          <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:pb-0" aria-label="个人中心导航">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/account" && pathname.startsWith(`${item.href}/`));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
