from __future__ import annotations

import asyncio
from pathlib import Path

from agent.config import AgentConfig
from agent.modules import build_default_modules
from agent.runner import ModuleRunner


async def main() -> None:
    config = AgentConfig.load(Path("config.json"))
    modules = build_default_modules(config)
    runner = ModuleRunner(config, modules=modules)
    await runner.start()
    print("MODULES", [module.name for module in runner.modules])
    await asyncio.sleep(0.5)
    await runner.stop()
    print("STOPPED")


if __name__ == "__main__":
    asyncio.run(main())
