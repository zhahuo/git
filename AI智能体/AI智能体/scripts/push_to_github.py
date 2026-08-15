from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result.stdout.strip()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="把 AI 智能体项目推送到 GitHub")
    parser.add_argument(
        "--repo-url",
        default=os.getenv("GITHUB_REPO_URL", ""),
        help="GitHub 仓库地址，例如 https://github.com/用户名/ai-agent.git",
    )
    args = parser.parse_args(argv)
    repo_url = (args.repo_url or "").strip()
    if not repo_url:
        print("缺少仓库地址：请用 --repo-url 传入，或设置 GITHUB_REPO_URL 环境变量。")
        return 1

    try:
        remote = run_git(["remote", "get-url", "origin"])
    except RuntimeError:
        remote = ""
    if remote:
        print(f"已存在远程仓库：{remote}")
        if remote != repo_url:
            print(f"将更新为：{repo_url}")
            run_git(["remote", "set-url", "origin", repo_url])
    else:
        run_git(["remote", "add", "origin", repo_url])
        print(f"已添加远程仓库：{repo_url}")

    run_git(["branch", "-M", "main"])
    print(run_git(["push", "-u", "origin", "main"]))
    print("推送完成。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
