export interface StoreCategory {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  product_count?: number;
}

export interface StoreProduct {
  id: number;
  category_id: number | null;
  category_name: string | null;
  name: string;
  description: string;
  cover: string;
  price_cents: number;
  original_price_cents: number | null;
  is_active: 0 | 1;
  stock_alert_threshold: number;
  stock_count: number;
  sales_count: number;
  created_at: string;
  updated_at: string;
}

export interface PublicUser {
  id: number;
  username: string;
  nickname: string;
  email: string;
  role: "user" | "admin";
  balance_cents: number;
  created_at: string;
}

export interface Card {
  id: number;
  product_id: number;
  product_name?: string;
  content: string;
  status: "available" | "sold";
  order_item_id: number | null;
  sold_at: string | null;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  cover: string;
  unit_price_cents: number;
  quantity: number;
  cards?: Card[];
}

export interface Order {
  id: number;
  order_no: string;
  user_id: number;
  username: string;
  status: "pending" | "paid" | "delivered" | "cancelled";
  total_cents: number;
  remark: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}
