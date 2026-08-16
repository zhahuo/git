"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, ShieldCheck, ShoppingCart, Ticket, UserRound, X } from "lucide-react";
import { useCart } from "./cart-context";
import { useSession } from "./use-session";

export function StorefrontHeader() {
  const { count, hydrated } = useCart();
  const { user, loading, refresh } = useSession();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 会话清理失败时仍刷新本地状态
    }
    await refresh();
    setMenuOpen(false);
  }

  const badgeCount = hydrated ? count : 0;
  const displayName = user?.nickname || user?.username || "";

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          className="storefront-icon-btn lg:hidden"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link href="/" className="flex min-w-0 items-center gap-2 text-base font-bold text-white">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-orange-500 text-white">
            <Ticket className="h-5 w-5" />
          </span>
          <span className="truncate">虚拟卡网</span>
        </Link>

        <nav className="ml-4 hidden items-center gap-1 lg:flex">
          <Link href="/" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">
            全部商品
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="/cart" className="storefront-icon-btn relative" aria-label="购物车">
            <ShoppingCart className="h-5 w-5" />
            {badgeCount > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger-500 px-1 text-[11px] font-bold text-white">
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            )}
          </Link>

          {loading ? (
            <span className="storefront-skeleton hidden h-9 w-28 sm:block" aria-hidden="true" />
          ) : user ? (
            <div className="hidden items-center gap-1 sm:flex">
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                >
                  <ShieldCheck className="h-4 w-4" />
                  管理后台
                </Link>
              )}
              <Link
                href="/account"
                className="inline-flex max-w-36 items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
                title={displayName}
              >
                <UserRound className="h-4 w-4 shrink-0" />
                <span className="truncate">{displayName}</span>
              </Link>
              <button type="button" className="storefront-icon-btn" title="退出登录" aria-label="退出登录" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/auth/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900">
                登录
              </Link>
              <Link href="/auth/register" className="storefront-btn-primary storefront-btn-sm">
                注册
              </Link>
            </div>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-[#2b2e34] bg-[#16181c] lg:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2 sm:px-6" aria-label="移动端菜单">
            <Link href="/" className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              全部商品
            </Link>
            <Link href="/cart" className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              购物车
            </Link>
            <Link href="/account" className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
              个人中心
            </Link>
            {user?.role === "admin" && (
              <Link href="/admin" className="rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-800">
                管理后台
              </Link>
            )}
            <div className="my-2 border-t border-[#2b2e34] pt-2">
              {user ? (
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="truncate text-sm font-semibold text-zinc-200">{displayName}</span>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger-600 hover:bg-danger-50"
                    onClick={handleLogout}
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2">
                  <Link href="/auth/login" className="storefront-btn-secondary storefront-btn-sm flex-1">
                    登录
                  </Link>
                  <Link href="/auth/register" className="storefront-btn-primary storefront-btn-sm flex-1">
                    注册
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
