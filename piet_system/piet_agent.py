#!/usr/bin/env python3
"""
piet_agent.py — Universal Windows Workstation Supervision Agent for PIET AIML Dept.
===================================================================================
Department-Wide Multi-Lab Supervision (Labs 413, 414, 415, 416, 418, 419)
24 PCs per lab • Total 144 Workstations
Features:
- Native Windows Win32 LastInputInfo (Mouse & Keyboard Physical Idle Tracking)
- Active Foreground Window Title & Process Tracking
- Real-time Productivity Classifier: Fruitful (Coding) vs Idle vs Distracted
- High-Performance Desktop Screen Grabs (< 60KB JPEG)
- Remote Command Execution: Alerts, Lock, Shutdown, Reboot, Process Kill
- Built-in Zero-Touch Self-Update Engine (15-min MD5 hash check + hot restart)
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


# Win32 Structures for Physical Input Idle Detection
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
    "leetcode", "hackerrank", "documentation", "matlab", "rstudio", "tensor", "keras"
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
            headers={"Content-Type": "application/json", "User-Agent": "PIET-Department-Agent/3.5"},
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
        "hub_url": "https://labg418pc12.tailc8c1f6.ts.net",
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

    # Flexible CLI Override:
    # e.g.: python piet_agent.py 414 5
    #       python piet_agent.py PC-414-05
    #       python piet_agent.py --lab 414 --pc 5
    args = sys.argv[1:]
    i = 0
    pos_args = []
    while i < len(args):
        a = args[i]
        if a in ("--pc", "-p") and i + 1 < len(args):
            default_cfg["pc_id"] = args[i + 1].strip().upper()
            i += 2
        elif a in ("--lab", "-l") and i + 1 < len(args):
            default_cfg["lab_id"] = f"LAB-{args[i + 1].strip().upper().replace('LAB-', '')}"
            i += 2
        elif a in ("--hub", "-h") and i + 1 < len(args):
            default_cfg["hub_url"] = args[i + 1].strip()
            i += 2
        elif not a.startswith("-"):
            pos_args.append(a)
            i += 1
        else:
            i += 1

    # Positional args handling: e.g. "414 5" or "PC-414-05"
    if len(pos_args) >= 2 and pos_args[0].isdigit() and pos_args[1].isdigit():
        lab_num = pos_args[0].strip()
        pc_num = int(pos_args[1].strip())
        default_cfg["lab_id"] = f"LAB-{lab_num}"
        default_cfg["pc_id"] = f"PC-{lab_num}-{pc_num:02d}"
    elif len(pos_args) == 1:
        val = pos_args[0].strip().upper()
        if val.startswith("PC-"):
            default_cfg["pc_id"] = val
            parts = val.split("-")
            if len(parts) >= 2:
                default_cfg["lab_id"] = f"LAB-{parts[1]}"
        elif val.isdigit():
            # If only a number given, keep lab from config and set PC
            clean_lab = default_cfg["lab_id"].replace("LAB-", "")
            default_cfg["pc_id"] = f"PC-{clean_lab}-{int(val):02d}"

    # Auto-derive lab_id if pc_id has format PC-XXX-YY
    if default_cfg["pc_id"].startswith("PC-"):
        parts = default_cfg["pc_id"].split("-")
        if len(parts) >= 3 and parts[1].isdigit():
            default_cfg["lab_id"] = f"LAB-{parts[1]}"

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

    print("=" * 70)
    print(f"🚀 PIET AIML DEPT. — UNIVERSAL WORKSTATION SUPERVISION AGENT")
    print(f"🖥️ Workstation ID : {pc_id}")
    print(f"🏢 Assigned Lab    : {lab_id}")
    print(f"🌐 Backend Host    : {hub_url}")
    print(f"⏱️ Heartbeat Rate  : Every {interval}s")
    print(f"🎯 Productivity    : Win32 Native Input Tracker (Threshold: {idle_threshold}s)")
    print("=" * 70)

    start_time = time.time()
    fruitful_seconds = 0
    idle_seconds = 0
    distracted_seconds = 0
    active_work_seconds = 0

    boot_time_str = ""
    try:
        if HAS_PSUTIL:
            b_ts = psutil.boot_time()
            boot_time_str = datetime.fromtimestamp(b_ts).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass

    local_ip = "127.0.0.1"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        pass

    last_tick = time.time()
    last_update_check = time.time()
    UPDATE_CHECK_INTERVAL = 900  # 15 minutes silent check

    while True:
        try:
            now_tick = time.time()
            delta = int(now_tick - last_tick)
            last_tick = now_tick

            idle_now = get_windows_idle_seconds()
            win_title, proc_name, pid = get_active_window_details()
            activity_type, warn_reason = classify_activity(win_title, proc_name, idle_now, idle_threshold)

            if activity_type == "idle":
                idle_seconds += delta
            else:
                active_work_seconds += delta
                if activity_type == "fruitful":
                    fruitful_seconds += delta
                elif activity_type == "distracted":
                    distracted_seconds += delta

            uptime_secs = int(time.time() - start_time)
            cpu_pct = 0.0
            ram_pct = 0.0
            ram_used_gb = 0.0
            ram_total_gb = 0.0
            if HAS_PSUTIL:
                try:
                    cpu_pct = psutil.cpu_percent(interval=None)
                    vm = psutil.virtual_memory()
                    ram_pct = vm.percent
                    ram_used_gb = round(vm.used / (1024**3), 2)
                    ram_total_gb = round(vm.total / (1024**3), 2)
                except Exception:
                    pass

            top_procs = get_top_processes(limit=5)

            payload = {
                "pc_id": pc_id,
                "lab_id": lab_id,
                "ip_address": local_ip,
                "boot_time": boot_time_str,
                "uptime_seconds": uptime_secs,
                "active_work_seconds": active_work_seconds,
                "fruitful_seconds": fruitful_seconds,
                "idle_seconds": idle_seconds,
                "distracted_seconds": distracted_seconds,
                "cpu_percent": cpu_pct,
                "ram_percent": ram_pct,
                "ram_used_gb": ram_used_gb,
                "ram_total_gb": ram_total_gb,
                "active_window": win_title[:150],
                "active_app": proc_name[:80],
                "activity_type": activity_type,
                "warning_reason": warn_reason,
                "top_processes": top_procs
            }

            success, resp_data = send_post_json(heartbeat_endpoint, payload, timeout=5)
            t_str = datetime.now().strftime("%H:%M:%S")

            if success:
                act_icon = "🟢" if activity_type == "fruitful" else ("🟡" if activity_type == "neutral" else ("💤" if activity_type == "idle" else "🔴"))
                print(f"[{t_str}] {act_icon} [{pc_id}|{lab_id}] OK | App: {proc_name} | State: {activity_type.upper()} | CPU: {cpu_pct}% | RAM: {ram_pct}%")

                cmd = resp_data.get("command") if isinstance(resp_data, dict) else None
                if cmd:
                    execute_remote_command(cmd, pc_id, lab_id, hub_url, screenshot_endpoint)
            else:
                print(f"[{t_str}] ⚠️ [{pc_id}] Backend host unreachable ({hub_url}). Retrying in {interval}s...")

        except Exception as e:
            print(f"[ERR] Workstation loop exception: {e}")

        time.sleep(interval)

        # Silent periodic background update check (every 15 min)
        try:
            if time.time() - last_update_check > UPDATE_CHECK_INTERVAL:
                last_update_check = time.time()
                check_and_apply_piet_auto_update(hub_url, pc_id)
        except Exception:
            pass


def execute_remote_command(cmd: str, pc_id: str, lab_id: str, hub_url: str, screenshot_endpoint: str):
    """Executes teacher commands dispatched from Central / Hub Portal."""
    if not cmd:
        return
    cmd = cmd.strip()
    cmd_lower = cmd.lower()
    print(f"\n[REMOTE-COMMAND] Received: '{cmd}'")

    if cmd_lower in ("capture_screen", "screenshot"):
        print(f"[CAPTURE] 📸 Screen capture requested for {pc_id}...")
        img_b64 = capture_desktop_screen()
        if img_b64:
            send_post_json(screenshot_endpoint, {
                "pc_id": pc_id,
                "lab_id": lab_id,
                "image_base64": img_b64
            }, timeout=6)
            print(f"[CAPTURE] 🚀 Screen capture uploaded successfully to {screenshot_endpoint}!")

    elif cmd_lower.startswith("warn:"):
        msg = cmd.split(":", 1)[1].strip()
        print(f"[ALERT] ⚠️ Teacher Alert: '{msg}'")
        try:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            alert_script = os.path.join(script_dir, "show_alert.py")
            if os.path.exists(alert_script):
                subprocess.Popen([sys.executable, alert_script, msg, "Dr. Richa Choudhary, Assistant Professor"])
            else:
                import threading
                threading.Thread(
                    target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, "PIET Lab Administrator Notice", 0x30 | 0x40000 | 0x10000),
                    daemon=True
                ).start()
        except Exception as we:
            print(f"[ALERT-ERR] {we}")

    elif cmd_lower in ("lock", "lockscreen"):
        print(f"[LOCK] 🔒 Locking Windows workstation session for {pc_id}...")
        try:
            ctypes.windll.user32.LockWorkStation()
        except Exception as le:
            print(f"[LOCK-ERR] {le}")

    elif cmd_lower in ("shutdown", "poweroff", "shutdown:force"):
        print(f"[SHUTDOWN] 🛑 Shutdown requested for {pc_id}...")
        try:
            subprocess.Popen(["shutdown", "/s", "/t", "5", "/c", "PIET Lab Administrator: Remote shutdown scheduled"])
        except Exception as se:
            print(f"[SHUTDOWN-ERR] {se}")

    elif cmd_lower in ("restart", "reboot", "restart:force"):
        print(f"[REBOOT] 🔄 Reboot requested for {pc_id}...")
        try:
            subprocess.Popen(["shutdown", "/r", "/t", "5", "/c", "PIET Lab Administrator: Remote reboot scheduled"])
        except Exception as re:
            print(f"[REBOOT-ERR] {re}")

    elif cmd_lower.startswith("kill:"):
        target_pid = cmd.split(":", 1)[1].strip()
        try:
            if target_pid.isdigit():
                subprocess.Popen(["taskkill", "/F", "/PID", target_pid])
                print(f"[KILL] Killed process PID {target_pid}")
            else:
                subprocess.Popen(["taskkill", "/F", "/IM", target_pid])
                print(f"[KILL] Killed process image {target_pid}")
        except Exception as ke:
            print(f"[KILL-ERR] {ke}")

    elif cmd_lower in ("update", "upgrade", "update:force", "self_update"):
        perform_piet_self_update(hub_url, pc_id)


def perform_piet_self_update(hub_url: str, pc_id: str) -> bool:
    """
    Downloads latest piet_agent.py from GitHub / Hub server,
    validates syntax, safely replaces script, and hot-restarts without human intervention.
    """
    print(f"\n[AUTO-UPDATE] 🔄 Auto-update sequence triggered for {pc_id}...")
    try:
        new_code = ""
        # 1. Try local/hub server
        try:
            update_url = f"{hub_url}/static/agent/piet_agent.py"
            req = urllib.request.Request(update_url, headers={"User-Agent": f"PIET-Agent/{pc_id}-AutoUpdate"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                new_code = resp.read().decode("utf-8")
        except Exception:
            pass

        # 2. Resilient GitHub Raw fallback
        if not new_code or len(new_code) < 1500:
            gh_url = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/piet_agent.py"
            req = urllib.request.Request(gh_url, headers={"User-Agent": f"PIET-Agent/{pc_id}-AutoUpdate"})
            with urllib.request.urlopen(req, timeout=12) as resp:
                new_code = resp.read().decode("utf-8")

        if len(new_code) < 1500 or "piet_agent.py" not in new_code:
            print(f"[AUTO-UPDATE-ERR] Downloaded payload invalid ({len(new_code)} bytes). Aborting.")
            return False

        compile(new_code, "<string>", "exec")

        current_script = os.path.abspath(__file__)
        new_file = current_script + ".new"
        with open(new_file, "w", encoding="utf-8") as f:
            f.write(new_code)

        # Also ensure show_alert.py is present
        try:
            alert_gh = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/show_alert.py"
            with urllib.request.urlopen(alert_gh, timeout=8) as a_resp:
                alert_code = a_resp.read().decode("utf-8")
            if len(alert_code) > 200:
                with open(os.path.join(os.path.dirname(current_script), "show_alert.py"), "w", encoding="utf-8") as af:
                    af.write(alert_code)
        except Exception:
            pass

        # Write hot-update batch script
        dir_path = os.path.dirname(current_script)
        up_bat = os.path.join(dir_path, "_hot_update.bat")
        with open(up_bat, "w", encoding="utf-8") as bf:
            bf.write(f'@echo off\ntimeout /t 2 /nobreak >nul\nmove /y "{new_file}" "{current_script}" >nul\nstart "" "{sys.executable}" "{current_script}" {" ".join(sys.argv[1:])}\nexit\n')
        
        subprocess.Popen(["cmd.exe", "/c", up_bat], creationflags=0x08000000)
        print(f"[AUTO-UPDATE] ✅ Self-update applied cleanly for {pc_id}. Hot-restarting silently...")
        sys.exit(0)
    except Exception as ue:
        print(f"[AUTO-UPDATE-ERR] {ue}")
        return False


def check_and_apply_piet_auto_update(hub_url: str, pc_id: str):
    """Silent periodic check for updates against remote GitHub raw MD5 hash."""
    try:
        import hashlib
        gh_url = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/piet_agent.py"
        req = urllib.request.Request(gh_url, headers={"User-Agent": f"PIET-Agent/{pc_id}-HashCheck"})
        with urllib.request.urlopen(req, timeout=8) as r:
            remote_bytes = r.read()

        remote_md5 = hashlib.md5(remote_bytes).hexdigest()
        local_md5 = hashlib.md5(open(os.path.abspath(__file__), "rb").read()).hexdigest()
        if remote_md5 != local_md5:
            print(f"\n[AUTO-UPDATE] 🔔 New agent code detected on GitHub. Updating {pc_id} silently...")
            perform_piet_self_update(hub_url, pc_id)
    except Exception:
        pass


if __name__ == "__main__":
    main()
