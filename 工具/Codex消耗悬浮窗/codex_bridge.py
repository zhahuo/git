import ctypes
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
PYTHON_DIR = Path(r"C:\Users\袁\.cache\codex-runtimes\codex-primary-runtime\dependencies\python")
PYTHON = PYTHON_DIR / "python.exe"
PYTHONW = PYTHON_DIR / "pythonw.exe"
WIDGET = BASE_DIR / "codex_cost_widget.py"
LOG = BASE_DIR / "data" / "bridge.log"
CHECK_INTERVAL = 2.0
MUTEX_NAME = "Local\\CodexCostWidgetBridge"


def log(message):
    (BASE_DIR / "data").mkdir(parents=True, exist_ok=True)
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}\n"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line)


def acquire_mutex():
    kernel32 = ctypes.windll.kernel32
    mutex = kernel32.CreateMutexW(None, False, MUTEX_NAME)
    if not mutex:
        return False
    if kernel32.GetLastError() == 183:
        return False
    return mutex


def is_codex_running():
    try:
        output = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq codex.exe", "/NH"],
            capture_output=True,
            text=True,
            timeout=5,
        ).stdout
        return "codex.exe" in output.lower()
    except Exception:
        return False


def main():
    mutex = acquire_mutex()
    if not mutex:
        sys.exit(0)

    log("bridge started")
    widget = None
    codex_was_running = False

    try:
        while True:
            codex_running = is_codex_running()
            if codex_running and widget is None:
                widget = subprocess.Popen(
                    [str(PYTHONW if PYTHONW.exists() else PYTHON), str(WIDGET)],
                    cwd=str(BASE_DIR),
                    creationflags=subprocess.CREATE_NO_WINDOW,
                )
                log("codex running, widget started")
            elif not codex_running and widget is not None:
                if widget.poll() is None:
                    widget.terminate()
                widget = None
                log("codex stopped, widget stopped")

            if codex_running and not codex_was_running:
                log("codex appeared")
            elif not codex_running and codex_was_running:
                log("codex disappeared")
            codex_was_running = codex_running
            time.sleep(CHECK_INTERVAL)
    except KeyboardInterrupt:
        pass
    finally:
        if widget is not None and widget.poll() is None:
            widget.terminate()
        log("bridge stopped")


if __name__ == "__main__":
    main()
