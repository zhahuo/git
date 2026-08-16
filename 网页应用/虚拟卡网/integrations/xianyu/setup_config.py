"""Seed the local Xianyu auto-reply configuration.

Run from integrations/xianyu with the project venv:
    .\\venv\\Scripts\\python.exe setup_config.py

It writes the single test account, keyword rules, default reply and a
DingTalk placeholder notification channel into data/xianyu_data.db.
Replace the placeholder cookie with a real Xianyu cookie before enabling
the account listener.
"""

import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parent / ".env")

from db_manager import db_manager  # noqa: E402


ACCOUNT_ID = "test_account_01"
PLACEHOLDER_COOKIE = (
    "unb=test_user_01; cookie2=placeholder_cookie_2; "
    "sgcookie=placeholder_sgcookie; _m_h5_tk=placeholder_tk; "
    "_m_h5_tk_enc=placeholder_tk_enc; t=placeholder_t; cna=placeholder_cna"
)
DEFAULT_REPLY = (
    '亲爱的"{send_user_name}" 老板你好！所有宝贝都可以拍，'
    "秒发货的哈~不满意的话可以直接申请退款哈~"
)
KEYWORDS = [
    ("价格", "亲，价格请直接拍下，页面价格即最终价格，秒发货哦。", None),
    ("发货", "亲，付款后系统自动秒发卡密，请留意聊天消息。", None),
    ("有没有货", "这款有现货，直接拍下即可，自动秒发。", "DEMO-ITEM-001"),
]


def main() -> None:
    admin = db_manager.get_user_by_username("admin")
    user_id = admin["id"] if admin else 1

    db_manager.save_cookie(ACCOUNT_ID, PLACEHOLDER_COOKIE, user_id)
    db_manager.save_text_keywords_only(ACCOUNT_ID, KEYWORDS)
    db_manager.save_default_reply(ACCOUNT_ID, True, DEFAULT_REPLY, False)

    channels = db_manager.get_notification_channels(user_id)
    if not any(channel["name"] == "钉钉占位通知" for channel in channels):
        db_manager.create_notification_channel(
            "钉钉占位通知",
            "dingtalk",
            '{"webhook_url":"https://oapi.dingtalk.com/robot/send?access_token=REPLACE_ME","secret":""}',
            user_id,
        )
        print("已创建钉钉占位通知渠道")
    else:
        print("钉钉占位通知渠道已存在，跳过")

    print(f"配置完成：账号 {ACCOUNT_ID}、3 条回复规则、默认回复、通知渠道")


if __name__ == "__main__":
    main()
