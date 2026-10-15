#!/usr/bin/env python3
"""
lab_414_agent.py — Dedicated Windows Telemetry & Supervision Agent for Lab 414
=============================================================================
PIET AI/ML Department • Smart Lab Supervision Ecosystem
Features:
- Native Windows Win32 LastInputInfo (Tracks Mouse & Keyboard Idle Time)
- Active Window Title & Process Inspection
- Fruitful (Productive Coding) vs Idle vs Distracted Activity Classifier
- On-Demand Screen Grabs (Native Desktop via Pillow ImageGrab)
- Process CPU & RAM Metrics
- Background Invisible Daemon (zero user interruption)
"""

import os
import sys
import time
import json
import socket
import platform
import atexit
import signal
import subprocess
from datetime import datetime
import urllib.request
import urllib.error

# Windows API bindings via ctypes
import ctypes
from ctypes import wintypes

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    from PIL import Image, ImageGrab
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Win32 Structures for Input Idle Detection
class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]


def get_windows_idle_seconds() -> float:
    """Returns number of seconds since user last touched physical mouse or keyboard."""
    try:
        lii = LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(LASTINPUTINFO)
        if ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            millis = ctypes.windll.kernel32.GetTickCount() - lii.dwTime
            return max(0.0, millis / 1000.0)
    except Exception:
        pass
    return 0.0


def get_active_window_details():
    """Returns (active_window_title, active_process_name, pid)."""
    title = ""
    proc_name = ""
    pid_val = 0
    try:
        hwnd = ctypes.windll.user32.GetForegroundWindow()
        if hwnd:
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
                title = buf.value.strip()

            p_id = wintypes.DWORD()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(p_id))
            pid_val = p_id.value
            if pid_val and HAS_PSUTIL:
                try:
                    proc_name = psutil.Process(pid_val).name()
                except Exception:
                    pass
    except Exception:
        pass

    return title or "Desktop / Idle", proc_name or "Explorer", pid_val


# ── Activity Classifier ──

FRUITFUL_KEYWORDS = [
    "visual studio", "code", "pycharm", "jupyter", "colab", "python",
    "anaconda", "spyder", "sublime", "atom", "notepad++", "eclipse",
    "powershell", "cmd", "command prompt", "terminal", "bash", "git",
    "github", "mysql", "workbench", "mongodb", "sqlite", "dbeaver",
    "postman", "kaggle", "stackoverflow", "geeksforgeeks", "w3schools",
    "leetcode", "hackerank", "documentation", "matlab", "rstudio"
]

DISTRACTED_KEYWORDS = [
    "steam", "epic games", "valorant", "minecraft", "roblox", "gta",
    "counter-strike", "csgo", "pubg", "free fire", "fortnite", "game",
    "youtube", "netflix", "prime video", "hotstar", "twitch", "instagram",
    "facebook", "tiktok", "twitter", "reddit", "discord", "spotify"
]


def classify_activity(window_title: str, proc_name: str, idle_secs: float, idle_threshold: float = 180.0):
    """
    Classifies workstation state into:
    - 'idle'       : No physical mouse/keyboard activity > threshold (e.g. 3 mins)
    - 'distracted' : Playing games, social media, entertainment (Warning Flag)
    - 'fruitful'   : Active coding, IDE, terminal, educational research
    - 'neutral'    : General document, file browsing, idle desktop
    """
    if idle_secs >= idle_threshold:
        return "idle", "User idle (No keyboard/mouse activity)"

    haystack = f"{window_title.lower()} {proc_name.lower()}"

    for kw in DISTRACTED_KEYWORDS:
        if kw in haystack:
            return "distracted", f"Unauthorized activity detected: '{kw}'"

    for kw in FRUITFUL_KEYWORDS:
        if kw in haystack:
            return "fruitful", ""

    return "neutral", ""


def get_top_processes(limit=5):
    """Gathers top CPU/RAM consuming processes."""
    procs = []
    if not HAS_PSUTIL:
        return procs
    try:
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                info = p.info
                if info and info['name'] and info['name'].lower() not in ('system idle process', 'system'):
                    procs.append({
                        "pid": info['pid'],
                        "name": info['name'],
                        "cpu": round(info['cpu_percent'] or 0.0, 1),
                        "ram": round(info['memory_percent'] or 0.0, 1)
                    })
            except Exception:
                continue
        procs.sort(key=lambda x: x['cpu'], reverse=True)
        return procs[:limit]
    except Exception:
        return procs


def capture_desktop_screen() -> str:
    """Captures native Windows desktop screen, resizes, and base64 encodes it."""
    import base64
    import io
    if not HAS_PIL:
        return ""
    try:
        img = ImageGrab.grab()
        img.thumbnail((1600, 900))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=65)
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        print(f"[CAPTURE-ERR] {e}")
        return ""


def send_post_json(url, data_dict, timeout=6):
    try:
        data_bytes = json.dumps(data_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json", "User-Agent": "PIET-Lab414-Agent/3.0"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                return True, json.loads(body)
            except Exception:
                return True, {}
    except Exception:
        return False, {}


def load_config():
    cfg_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_config.json")
    default_cfg = {
        "pc_id": "PC-414-01",
        "lab_id": "LAB-414",
        "hub_url": "https://raspberrypi.tailc8c1f6.ts.net",
        "heartbeat_interval": 6,
        "idle_threshold_seconds": 180
    }
    if os.path.exists(cfg_file):
        try:
            with open(cfg_file, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                default_cfg.update(loaded)
        except Exception:
            pass

    # CLI Override: python lab_414_agent.py PC-414-05
    if len(sys.argv) > 1:
        arg_val = sys.argv[1].strip().upper()
        if arg_val.isdigit():
            default_cfg["pc_id"] = f"PC-414-{int(arg_val):02d}"
        else:
            default_cfg["pc_id"] = arg_val

    return default_cfg


def main():
    config = load_config()
    pc_id = config["pc_id"].upper()
    lab_id = config["lab_id"].upper()
    hub_url = config["hub_url"].rstrip("/")
    interval = max(3, config.get("heartbeat_interval", 6))
    idle_threshold = config.get("idle_threshold_seconds", 180)

    heartbeat_endpoint = f"{hub_url}/api/heartbeat"
    screenshot_endpoint = f"{hub_url}/api/screenshot"

    print("=" * 68)
    print(f"🚀 PIET AIML DEPT. — LAB 414 WINDOWS WORKSTATION AGENT")
    print(f"🖥️ PC ID        : {pc_id}")
    print(f"🏢 Lab ID       : {lab_id}")
    print(f"🌐 Hub URL      : {hub_url}")
    print(f"⏱️ Heartbeat    : Every {interval}s")
    print(f"🎯 Productivity : Mouse & Keyboard Native Input Tracker Active")
    print("=" * 68)

    # Accumulator counters
    start_time = time.time()
    fruitful_seconds = 0
    idle_seconds = 0
    distracted_seconds = 0
    active_work_seconds = 0

    # Boot time detection
    boot_time_str = ""
    try:
        if HAS_PSUTIL:
            b_ts = psutil.boot_time()
            boot_time_str = datetime.fromtimestamp(b_ts).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass

    # IP detection
    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    last_tick = time.time()

    while True:
        try:
            now_tick = time.time()
            delta = int(now_tick - last_tick)
            last_tick = now_tick

            # Native Input Idle Detection
            idle_now = get_windows_idle_seconds()
            win_title, proc_name, pid = get_active_window_details()

            # Classify Activity
            activity_type, warn_reason = classify_activity(win_title, proc_name, idle_now, idle_threshold)

            # Accumulate metrics
            if activity_type == "idle":
                idle_seconds += delta
            else:
                active_work_seconds += delta
                if activity_type == "fruitful":
                    fruitful_seconds += delta
                elif activity_type == "distracted":
                    distracted_seconds += delta

            uptime_seconds = int(now_tick - start_time)

            # CPU & RAM Metrics
            cpu_pct = 0.0
            ram_pct = 0.0
            ram_used = 0.0
            ram_total = 0.0
            if HAS_PSUTIL:
                cpu_pct = psutil.cpu_percent(interval=None)
                vmem = psutil.virtual_memory()
                ram_pct = vmem.percent
                ram_used = round(vmem.used / (1024**3), 1)
                ram_total = round(vmem.total / (1024**3), 1)

            top_procs = get_top_processes(limit=5)

            payload = {
                "pc_id": pc_id,
                "lab_id": lab_id,
                "ip_address": local_ip,
                "boot_time": boot_time_str,
                "uptime_seconds": uptime_seconds,
                "active_work_seconds": active_work_seconds,
                "fruitful_seconds": fruitful_seconds,
                "idle_seconds": idle_seconds,
                "distracted_seconds": distracted_seconds,
                "cpu_percent": cpu_pct,
                "ram_percent": ram_pct,
                "ram_used_gb": ram_used,
                "ram_total_gb": ram_total,
                "gpu_name": "Windows Display Adapter",
                "gpu_percent": 0.0,
                "gpu_temp": 0.0,
                "active_window": win_title,
                "active_app": proc_name,
                "activity_type": activity_type,
                "warning_reason": warn_reason,
                "top_processes": top_procs
            }

            success, resp_data = send_post_json(heartbeat_endpoint, payload)
            t_now = datetime.now().strftime("%H:%M:%S")

            if success:
                act_tag = f"🎯 FRUITFUL" if activity_type == "fruitful" else (f"💤 IDLE ({int(idle_now)}s)" if activity_type == "idle" else (f"⚠️ DISTRACTED" if activity_type == "distracted" else "⚪ NORMAL"))
                print(f"[{t_now}] 🟢 [{pc_id}] OK | {act_tag} | Win: '{win_title[:30]}' | CPU: {cpu_pct}% | RAM: {ram_pct}%")

                # Handle Remote Command from Teacher / Lab Administrator
                cmd = resp_data.get("command")
                if cmd:
                    cmd_clean = cmd.strip()
                    cmd_lower = cmd_clean.lower()
                    print(f"[{t_now}] ⚡ Received Remote Command: '{cmd_clean}'")

                    if cmd_clean == "capture_screen":
                        print(f"[{t_now}] 📸 Capturing live desktop screen on demand...")
                        img_b64 = capture_desktop_screen()
                        if img_b64:
                            snap_ok, _ = send_post_json(screenshot_endpoint, {
                                "pc_id": pc_id,
                                "image_base64": img_b64
                            })
                            if snap_ok:
                                print(f"[{t_now}] 🚀 Live screen uploaded to Teacher Portal!")

                    elif cmd_lower in ("shutdown", "poweroff", "shutdown:force"):
                        print(f"[{t_now}] 🛑 SHUTDOWN INITIATED by Lab Administrator: Shutting down in 5s...")
                        try:
                            # Graceful shutdown with 5s countdown
                            subprocess.Popen(["shutdown", "/s", "/f", "/t", "5", "/c", "PIET Lab Administrator: Remote shutdown sequence initiated."])
                        except Exception as se:
                            print(f"[SHUTDOWN-ERR] {se}")

                    elif cmd_lower in ("restart", "reboot", "restart:force"):
                        print(f"[{t_now}] 🔄 RESTART INITIATED by Lab Administrator: Rebooting in 5s...")
                        try:
                            # Graceful reboot with 5s countdown
                            subprocess.Popen(["shutdown", "/r", "/f", "/t", "5", "/c", "PIET Lab Administrator: Remote reboot sequence initiated."])
                        except Exception as re:
                            print(f"[REBOOT-ERR] {re}")

                    elif cmd_lower in ("lock", "lockscreen"):
                        print(f"[{t_now}] 🔒 LOCK INITIATED: Locking Windows workstation...")
                        try:
                            ctypes.windll.user32.LockWorkStation()
                        except Exception as le:
                            try:
                                subprocess.Popen(["rundll32.exe", "user32.dll,LockWorkStation"])
                            except Exception:
                                print(f"[LOCK-ERR] {le}")

                    elif cmd_clean.startswith("warn:"):
                        msg = cmd_clean.split(":", 1)[1].strip()
                        print(f"[{t_now}] ⚠️ LAB NOTICE: '{msg}'")
                        try:
                            import threading
                            threading.Thread(
                                target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, "PIET Lab Administrator Notice", 0x30 | 0x40000),
                                daemon=True
                            ).start()
                        except Exception as we:
                            print(f"[WARN-ERR] {we}")

                    elif cmd_clean.startswith("kill:"):
                        target_pid = cmd_clean.split(":", 1)[1].strip()
                        if target_pid.isdigit() and HAS_PSUTIL:
                            try:
                                psutil.Process(int(target_pid)).terminate()
                                print(f"[{t_now}] ✖ Terminated PID {target_pid}")
                            except Exception as e:
                                print(f"[KILL-ERR] {e}")
            else:
                print(f"[{t_now}] ⚠️ [{pc_id}] Hub unreachable ({hub_url}). Retrying in {interval}s...")

        except Exception as e:
            print(f"[LOOP-ERR] {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
