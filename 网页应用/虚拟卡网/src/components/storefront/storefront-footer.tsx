import Link from "next/link";
import { Ticket } from "lucide-react";

const linkClass = "text-sm text-zinc-400 transition-colors hover:text-orange-400";

export function StorefrontFooter() {
  return (
    <footer className="border-t border-[#2b2e34] bg-[#16181c]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2 text-base font-bold text-white">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-orange-500 text-white">
                <Ticket className="h-4 w-4" />
              </span>
              虚拟卡网
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-400">官方直供虚拟商品与卡密，付款后自动发货。</p>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <h3 className="mb-3 text-sm font-semibold text-zinc-200">购物</h3>
              <ul className="space-y-2">
                <li><Link href="/" className={linkClass}>全部商品</Link></li>
                <li><Link href="/cart" className={linkClass}>购物车</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-zinc-200">账户</h3>
              <ul className="space-y-2">
                <li><Link href="/account" className={linkClass}>个人中心</Link></li>
                <li><Link href="/auth/login" className={linkClass}>登录</Link></li>
                <li><Link href="/auth/register" className={linkClass}>注册</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-semibold text-zinc-200">订单</h3>
              <ul className="space-y-2">
                <li><Link href="/account/orders" className={linkClass}>我的订单</Link></li>
                <li><Link href="/checkout" className={linkClass}>结算</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-8 border-t border-[#2b2e34] pt-4 text-xs text-zinc-500">© 2026 虚拟卡网</div>
      </div>
    </footer>
  );
}
