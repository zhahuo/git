import { hashPassword } from "./password.ts";
import type { DatabaseSync } from "node:sqlite";

const PRODUCTS: Array<{
  category: string;
  name: string;
  description: string;
  cover: string;
  priceCents: number;
  originalCents: number;
  stock: number;
}> = [
  {
    category: "游戏充值",
    name: "Steam 充值卡 50 元",
    description: "官方正品 Steam 钱包充值码，中国区账号可直接兑换，付款后秒发卡密。",
    cover: "/covers/steam.svg",
    priceCents: 4690,
    originalCents: 5000,
    stock: 60,
  },
  {
    category: "游戏充值",
    name: "Steam 充值卡 100 元",
    description: "官方正品 Steam 钱包充值码，支持国区与全球区账号，兑换后 30 天内有效。",
    cover: "/covers/steam-100.svg",
    priceCents: 9390,
    originalCents: 10000,
    stock: 45,
  },
  {
    category: "影音娱乐",
    name: "B 站大会员 月卡",
    description: "B 站大会员 31 天兑换码，支持大会员专属内容、更高清晰度与直播特权。",
    cover: "/covers/bilibili.svg",
    priceCents: 1980,
    originalCents: 2500,
    stock: 80,
  },
  {
    category: "影音娱乐",
    name: "爱奇艺黄金 VIP 月卡",
    description: "爱奇艺黄金 VIP 会员月卡，手机、电脑、平板多端可用，兑换后自动开通。",
    cover: "/covers/iqiyi.svg",
    priceCents: 1590,
    originalCents: 2500,
    stock: 55,
  },
  {
    category: "影音娱乐",
    name: "腾讯视频 VIP 月卡",
    description: "腾讯视频 VIP 会员月卡，畅享海量剧集、电影与综艺，付款后立即发货。",
    cover: "/covers/tencent.svg",
    priceCents: 1690,
    originalCents: 3000,
    stock: 40,
  },
  {
    category: "会员订阅",
    name: "网易云音乐黑胶 VIP 季卡",
    description: "网易云音乐黑胶 VIP 90 天兑换码，无损音质、会员曲库与专属权益。",
    cover: "/covers/netease.svg",
    priceCents: 3490,
    originalCents: 4500,
    stock: 35,
  },
  {
    category: "会员订阅",
    name: "QQ 音乐豪华绿钻 月卡",
    description: "QQ 音乐豪华绿钻 31 天兑换码，解锁付费曲库、高品质音质与个性装扮。",
    cover: "/covers/qqmusic.svg",
    priceCents: 1290,
    originalCents: 1800,
    stock: 70,
  },
  {
    category: "生活服务",
    name: "京东 E 卡 100 元",
    description: "京东自营通用 E 卡兑换码，面值 100 元，绑定后可购买京东自营商品。",
    cover: "/covers/jd.svg",
    priceCents: 9850,
    originalCents: 10000,
    stock: 25,
  },
  {
    category: "生活服务",
    name: "美团外卖 20 元代金券",
    description: "美团外卖通用代金券兑换码，点餐时抵扣 20 元，全国可用。",
    cover: "/covers/meituan.svg",
    priceCents: 1750,
    originalCents: 2000,
    stock: 8,
  },
];

function cardContent(seed: string, index: number): string {
  const part = (n: number, salt: number) =>
    String((seed.charCodeAt(n % seed.length) * 7919 + index * 104729 + salt * 2654435761) % 10000)
      .padStart(4, "0");
  return `${part(0, 11)}-${part(1, 17)}-${part(2, 23)}-${part(3, 29)}`;
}

export function seedIfEmpty(db: DatabaseSync): void {
  // Next build 可能并行加载多个 worker，BEGIN IMMEDIATE 串行化首次建库写种子，避免并发重复插入。
  db.exec("BEGIN IMMEDIATE");
  try {
    const count = db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number };
    if (count.c > 0) {
      db.exec("COMMIT");
      return;
    }
    const insertUser = db.prepare(
      "INSERT INTO users (username, password_hash, nickname, role, balance_cents) VALUES (?, ?, ?, ?, ?)"
    );
    const adminId = Number(
      insertUser.run("admin", hashPassword("admin123"), "管理员", "admin", 0).lastInsertRowid
    );
    const userId = Number(
      insertUser.run("user", hashPassword("user123"), "演示用户", "user", 5000).lastInsertRowid
    );
    db.prepare(
      "INSERT INTO balance_logs (user_id, change_cents, balance_after_cents, type, note) VALUES (?, ?, ?, 'recharge', ?)"
    ).run(userId, 5000, 5000, "新用户欢迎礼金");

    const categoryIds = new Map<string, number>();
    const insertCategory = db.prepare(
      "INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)"
    );
    const insertProduct = db.prepare(
      `INSERT INTO products
        (category_id, name, description, cover, price_cents, original_price_cents, stock_alert_threshold)
       VALUES (?, ?, ?, ?, ?, ?, 10)`
    );
    const insertCard = db.prepare(
      "INSERT INTO cards (product_id, content) VALUES (?, ?)"
    );

    const cats = ["游戏充值", "影音娱乐", "会员订阅", "生活服务"];
    cats.forEach((name, i) => {
      const id = Number(insertCategory.run(name, name, i).lastInsertRowid);
      categoryIds.set(name, id);
    });

    for (const p of PRODUCTS) {
      const productId = Number(
        insertProduct.run(
          categoryIds.get(p.category) ?? null,
          p.name,
          p.description,
          p.cover,
          p.priceCents,
          p.originalCents
        ).lastInsertRowid
      );
      for (let i = 0; i < p.stock; i++) {
        insertCard.run(productId, cardContent(p.name, i + 1));
      }
    }

    db.prepare(
      "INSERT INTO balance_logs (user_id, change_cents, balance_after_cents, type, note) VALUES (?, 0, 0, 'adjust', ?)"
    ).run(adminId, "系统初始化");
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
