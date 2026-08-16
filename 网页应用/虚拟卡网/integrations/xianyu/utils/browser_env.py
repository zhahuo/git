"""Browser selection helpers for Playwright and DrissionPage.

The upstream project defaults to Playwright-managed Chromium.  On this
machine we prefer the system Edge browser, controlled via the
BROWSER_CHANNEL / BROWSER_EXECUTABLE_PATH environment variables so that no
Chromium download is required.
"""

import os


def browser_launch_kwargs() -> dict:
    """Return Playwright launch kwargs for the configured browser."""
    channel = os.getenv("BROWSER_CHANNEL", "").strip()
    executable = os.getenv("BROWSER_EXECUTABLE_PATH", "").strip()
    if channel:
        return {"channel": channel}
    if executable:
        return {"executable_path": executable}
    return {}


def drissionpage_browser_path() -> str:
    """Return a DrissionPage-compatible browser path, or empty string."""
    executable = os.getenv("BROWSER_EXECUTABLE_PATH", "").strip()
    if executable and os.path.exists(executable):
        return executable
    if os.name == "nt":
        candidates = (
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        )
        for candidate in candidates:
            if os.path.exists(candidate):
                return candidate
    return ""
