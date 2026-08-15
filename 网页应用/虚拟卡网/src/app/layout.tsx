import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { CartProvider } from "@/components/storefront/cart-context";
import { StorefrontFooter } from "@/components/storefront/storefront-footer";
import { StorefrontHeader } from "@/components/storefront/storefront-header";

export const metadata: Metadata = {
  title: {
    default: "虚拟卡网",
    template: "%s | 虚拟卡网",
  },
  description: "虚拟卡网 - 官方直供虚拟卡密商城，付款后自动发货",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-white text-ink-800">
        <CartProvider>
          <StorefrontHeader />
          <main className="flex-1">{children}</main>
          <StorefrontFooter />
        </CartProvider>
      </body>
    </html>
  );
}
