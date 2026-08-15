from __future__ import annotations

import argparse
import asyncio
import signal
import sys
from pathlib import Path

from .brain import AgentBrain
from .config import AgentConfig
from .channels.console import ConsoleChannel
from .channels.telegram import TelegramChannel
from .modules import build_default_modules
from .runner import ModuleRunner


async def _run_async(config: AgentConfig, channel: str | None) -> None:
    modules = build_default_modules(
        config,
        enabled=("brain", channel) if channel else None,
    )
    runner = ModuleRunner(config, modules=modules)
    await runner.start()

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except (NotImplementedError, RuntimeError):
            pass

    waiters = [asyncio.create_task(stop_event.wait())]
    for module in modules:
        waiter = getattr(module, "wait_finished", None)
        if waiter is not None:
            waiters.append(asyncio.create_task(waiter()))
    try:
        await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for waiter in waiters:
            waiter.cancel()
        await runner.stop()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="AI 智能体")
    parser.add_argument(
        "command",
        nargs="?",
        choices=["run"],
        default=None,
        help="以多模块并行方式运行",
    )
    parser.add_argument(
        "--channel",
        choices=["console", "telegram"],
        default=None,
        help="运行渠道：console 或 telegram",
    )
    parser.add_argument("--config", default="config.json", help="配置文件路径")
    args = parser.parse_args(argv)

    config = AgentConfig.load(Path(args.config))

    if args.command == "run":
        try:
            asyncio.run(_run_async(config, args.channel))
        except RuntimeError as exc:
            print(exc)
            return 1
        return 0

    brain = AgentBrain(config)
    channel = args.channel or "console"
    if channel == "telegram":
        if not config.telegram_token:
            print("缺少 TELEGRAM_BOT_TOKEN，无法启动 Telegram 机器人。")
            return 1
        TelegramChannel(brain, config.telegram_token).run()
    else:
        ConsoleChannel(brain).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
