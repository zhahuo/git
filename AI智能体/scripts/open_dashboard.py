from __future__ import annotations

from pathlib import Path

from agent.config import AgentConfig
from agent.dashboard_tk import run_dashboard


def main() -> None:
    config = AgentConfig.load(Path("config.json"))
    run_dashboard(config)


if __name__ == "__main__":
    main()
