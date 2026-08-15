from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

GIT = "git"


def run_git(repo: Path, args: list[str]) -> bytes:
    result = subprocess.run(
        [GIT, "-C", str(repo), *args],
        capture_output=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    return result.stdout


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="把本地子目录作为一个项目提交到 GitHub 多项目仓库的 main"
    )
    parser.add_argument("repo_path", help="GitHub 仓库的本地克隆路径")
    parser.add_argument("subdir", help="要提交的项目子目录名，例如 AI智能体")
    parser.add_argument("message", help="提交信息")
    parser.add_argument("--push", action="store_true", help="创建提交后推送到 origin main")
    args = parser.parse_args(argv)

    repo = Path(args.repo_path).resolve()
    subdir = args.subdir
    os.environ["GIT_AUTHOR_NAME"] = "袁"
    os.environ["GIT_AUTHOR_EMAIL"] = "yuan@users.noreply.github.com"
    os.environ["GIT_COMMITTER_NAME"] = "袁"
    os.environ["GIT_COMMITTER_EMAIL"] = "yuan@users.noreply.github.com"

    index_file = repo / ".git" / "tmp-index-github"
    if index_file.exists():
        index_file.unlink()
    os.environ["GIT_INDEX_FILE"] = str(index_file)
    run_git(repo, ["read-tree", "--empty"])
    run_git(repo, ["add", subdir])
    subtree = run_git(repo, ["write-tree"]).strip().decode()

    root_tree = run_git(repo, ["rev-parse", "origin/main^{tree}"]).strip()
    ls = run_git(repo, ["ls-tree", "-z", root_tree])
    records: list[bytes] = []
    replaced = False
    subdir_bytes = subdir.encode("utf-8")
    for record in ls.split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, obj_type, oid = meta.split(b" ")
        if path == subdir_bytes:
            records.append(b"040000 tree " + subtree.encode() + b"\t" + subdir_bytes)
            replaced = True
        else:
            records.append(record)
    if not replaced:
        records.append(b"040000 tree " + subtree.encode() + b"\t" + subdir_bytes)

    mktree_input = b"".join(record + b"\0" for record in records)
    new_tree = subprocess.run(
        [GIT, "-C", str(repo), "mktree", "-z", "--missing"],
        input=mktree_input,
        capture_output=True,
    )
    if new_tree.returncode != 0:
        raise RuntimeError(new_tree.stderr.decode("utf-8", errors="replace"))
    new_tree_oid = new_tree.stdout.strip().decode()

    commit = subprocess.run(
        [GIT, "-C", str(repo), "commit-tree", new_tree_oid, "-p", "origin/main", "-m", args.message],
        capture_output=True,
    )
    if commit.returncode != 0:
        raise RuntimeError(commit.stderr.decode("utf-8", errors="replace"))
    commit_oid = commit.stdout.strip().decode()
    print(f"COMMIT {commit_oid}")

    if args.push:
        push = subprocess.run(
            [GIT, "-C", str(repo), "-c", "http.version=HTTP/1.1", "push", "origin", f"{commit_oid}:main"],
            capture_output=True,
            text=True,
        )
        if push.returncode != 0:
            raise RuntimeError(push.stderr or push.stdout)
        print(push.stdout.strip())
        print("PUSHED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
