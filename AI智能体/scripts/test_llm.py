from __future__ import annotations

import argparse
from pathlib import Path

from agent.config import AgentConfig
from agent.llm import LLMClient


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", help="要测试的模型名")
    args = parser.parse_args()
    config = AgentConfig.load(Path("config.json"))
    model = args.model or config.model
    llm = LLMClient(config.base_url, config.api_key, model)
    try:
        message = llm.chat(
            [{"role": "user", "content": "请只回复两个字：正常"}],
            temperature=0.2,
        )
        print(f"OK {model}:", (message.get("content") or "")[:200])
    except Exception as exc:
        print(f"FAIL {model}:", type(exc).__name__, str(exc)[:400])


if __name__ == "__main__":
    main()
