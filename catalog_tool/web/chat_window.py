"""Open the chat UI in a native-style browser window without an address bar."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_POPUP_WIDTH = 360
DEFAULT_POPUP_HEIGHT = 720
DETACHED_CHAT_WINDOW_TITLE = "Catalog Tool · Chat"


def open_chat_app_window(
    chat_url: str,
    *,
    width: int = DEFAULT_POPUP_WIDTH,
    height: int = DEFAULT_POPUP_HEIGHT,
    left: int | None = None,
    top: int | None = None,
) -> bool:
    """Launch chat in browser app mode (no URL bar). Returns True if a launch was attempted."""
    width = max(320, min(900, width))
    height = max(320, height)
    if sys.platform == "darwin":
        return _open_chat_app_window_macos(chat_url, width, height, left, top)
    if sys.platform == "win32":
        return _open_chat_app_window_windows(chat_url, width, height, left, top)
    if sys.platform.startswith("linux"):
        return _open_chat_app_window_linux(chat_url, width, height, left, top)
    return False


def resize_chat_app_window(
    *,
    width: int,
    height: int,
    left: int | None = None,
    top: int | None = None,
    title: str = DETACHED_CHAT_WINDOW_TITLE,
) -> bool:
    """Resize the detached chat window (macOS only)."""
    if sys.platform != "darwin":
        return False
    width = max(320, min(900, width))
    height = max(320, height)
    left = 0 if left is None else max(0, left)
    top = 0 if top is None else max(0, top)
    return _resize_macos_browser_window(width, height, left, top, title)


def _window_args(width: int, height: int, left: int | None, top: int | None) -> list[str]:
    args = [f"--window-size={width},{height}"]
    if left is not None and top is not None:
        args.append(f"--window-position={left},{top}")
    return args


def _macos_app_path(app_name: str) -> Path | None:
    for base in (Path("/Applications"), Path.home() / "Applications"):
        candidate = base / f"{app_name}.app"
        if candidate.is_dir():
            return candidate
    return None


def _resize_macos_browser_window(
    width: int,
    height: int,
    left: int,
    top: int,
    title: str,
) -> bool:
    safe_title = title.replace('"', '\\"')
    processes = ("Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser", "Arc")
    process_list = ", ".join(f'"{name}"' for name in processes)
    script = f'''
repeat with waitSeconds in {{0, 0.15, 0.35, 0.6, 1.0}}
    delay waitSeconds
    repeat with chromeName in {{{process_list}}}
        try
            tell application "System Events"
                if exists process chromeName then
                    tell process chromeName
                        repeat with w in windows
                            set windowTitle to name of w
                            if windowTitle is "{safe_title}" then
                                set position of w to {{{left}, {top}}}
                                set size of w to {{{width}, {height}}}
                                return
                            end if
                        end repeat
                    end tell
                end if
            end tell
        end try
    end repeat
end repeat
'''
    try:
        subprocess.Popen(
            ["osascript", "-e", script],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    except OSError:
        return False


def _open_chat_app_window_macos(
    chat_url: str,
    width: int,
    height: int,
    left: int | None,
    top: int | None,
) -> bool:
    window_args = _window_args(width, height, left, top)
    for app_name in ("Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser", "Arc"):
        if not _macos_app_path(app_name):
            continue
        try:
            subprocess.Popen(
                ["open", "-na", app_name, "--args", *window_args, f"--app={chat_url}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            _resize_macos_browser_window(
                width,
                height,
                left or 0,
                top or 0,
                DETACHED_CHAT_WINDOW_TITLE,
            )
            return True
        except OSError:
            continue
    return False


def _open_chat_app_window_windows(
    chat_url: str,
    width: int,
    height: int,
    left: int | None,
    top: int | None,
) -> bool:
    window_args = _window_args(width, height, left, top)
    candidates = [
        os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
    ]
    for exe in candidates:
        if exe and Path(exe).is_file():
            subprocess.Popen(
                [exe, *window_args, f"--app={chat_url}"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            return True
    return False


def _open_chat_app_window_linux(
    chat_url: str,
    width: int,
    height: int,
    left: int | None,
    top: int | None,
) -> bool:
    window_args = _window_args(width, height, left, top)
    for cmd in (
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "microsoft-edge",
        "brave-browser",
    ):
        path = shutil.which(cmd)
        if not path:
            continue
        subprocess.Popen(
            [path, *window_args, f"--app={chat_url}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True
    return False
