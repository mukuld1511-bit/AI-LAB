"""
desktop_app.py — Standalone Native Desktop App (Electron-Style Window)
----------------------------------------------------------------------
Provides a dedicated Native Window for the AI/ML Lab Attendance & PC Tracking System:
1. Spawns/Verifies FastAPI Backend Core in the background.
2. Opens a borderless or sleek native desktop application window (Chromium/Edge Webview engine).
3. Connects directly to http://127.0.0.1:8000/ (Admin Dashboard) or allows switching to Display / Mam's portal.
4. Native window controls: Minimize, Maximize, Fullscreen (Kiosk), Refresh.
5. Graceful exit: cleanly closes window without corrupting background services.
"""

import os
import sys
import time
import subprocess
import threading
import urllib.request
import webview

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DASHBOARD_URL = "http://127.0.0.1:8000"


def is_backend_alive():
    """Checks if FastAPI backend is responding on port 8000."""
    try:
        with urllib.request.urlopen(f"{DASHBOARD_URL}/health", timeout=2) as resp:
            return resp.status == 200
    except Exception:
        return False


def ensure_backend_running():
    """Spawns backend if not already active."""
    if not is_backend_alive():
        backend_script = os.path.join(CURRENT_DIR, "backend", "main.py")
        print("[DESKTOP APP] Starting FastAPI Backend Core in background...")
        subprocess.Popen(
            [sys.executable, backend_script],
            cwd=CURRENT_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        # Wait up to 10 seconds for backend to become ready
        for _ in range(20):
            time.sleep(0.5)
            if is_backend_alive():
                print("[DESKTOP APP] Backend Core connected successfully!")
                return True
    return True


class DesktopAPI:
    """JS-to-Python Bridge for Desktop Window Controls."""
    def __init__(self, window):
        self._window = window

    def toggle_fullscreen(self):
        self._window.toggle_fullscreen()

    def reload_portal(self):
        self._window.load_url(DASHBOARD_URL)

    def switch_to_display_portal(self):
        self._window.load_url(f"{DASHBOARD_URL}/display/")

    def switch_to_mams_portal(self):
        self._window.load_url(f"{DASHBOARD_URL}/mams_portal/")

    def switch_to_admin(self):
        self._window.load_url(DASHBOARD_URL)


def main():
    print("=" * 65)
    print("🔬 AI/ML LAB DESKTOP APP (Native Webview Shell)")
    print("=" * 65)

    # 1. Ensure backend is running
    ensure_backend_running()

    # 2. Configure Desktop Window properties
    window_title = "AI/ML LAB MONITOR — Desktop Operations Hub"
    width = 1380
    height = 880
    min_size = (1024, 700)

    # 3. Create the Native Desktop Window
    window = webview.create_window(
        title=window_title,
        url=DASHBOARD_URL,
        width=width,
        height=height,
        min_size=min_size,
        confirm_close=False,
        text_select=True,
        zoomable=True
    )

    api = DesktopAPI(window)
    window.expose(api.toggle_fullscreen, api.reload_portal, api.switch_to_display_portal, api.switch_to_mams_portal, api.switch_to_admin)

    # 4. Start the Native Window Loop (Edge Chromium Webview2 engine)
    print("[DESKTOP APP] Launching Native App Window...")
    webview.start(debug=False)
    print("[DESKTOP APP] Desktop Window closed.")


if __name__ == "__main__":
    main()
