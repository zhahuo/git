import os
import subprocess
import sys


PG_BIN = r"C:\Users\Public\pginstall\bin"
PG_DATA = r"C:\Users\Public\litellm-pgdata"
PG_PORT = 5433
DB_URL = f"postgresql://postgres@127.0.0.1:{PG_PORT}/postgres"


def postgres_running() -> bool:
    result = subprocess.run(
        [os.path.join(PG_BIN, "pg_isready.exe"), "-h", "127.0.0.1", "-p", str(PG_PORT)],
        capture_output=True,
        text=True,
        timeout=10,
    )
    return result.returncode == 0


def start_postgres() -> None:
    if postgres_running():
        return
    log_path = os.path.join(PG_DATA, "pg.log")
    result = subprocess.run(
        [
            os.path.join(PG_BIN, "pg_ctl.exe"),
            "-D",
            PG_DATA,
            "-w",
            "-o",
            '-h "127.0.0.1"',
            "-o",
            f"-p {PG_PORT}",
            "-l",
            log_path,
            "start",
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if result.returncode != 0:
        print(result.stdout, file=sys.stderr)
        print(result.stderr, file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    start_postgres()
    os.environ["DATABASE_URL"] = DB_URL
    os.environ["LITELLM_LOCAL_ANTHROPIC_BETA_HEADERS"] = "true"

    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    sys.argv = [
        "litellm",
        "--config",
        os.path.join(root, "config.yaml"),
        "--host",
        "127.0.0.1",
        "--port",
        "4000",
    ]

    from litellm import run_server

    run_server()


if __name__ == "__main__":
    main()
