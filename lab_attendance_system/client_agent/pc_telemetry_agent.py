"""
pc_telemetry_agent.py — Universal Workstation Telemetry & Monitoring Agent
-------------------------------------------------------------------------
Runs in the background on each Lab PC (PC-1 to PC-8, DGX).
1. On Startup: Pings central backend to mark PC as 🟢 ONLINE.
2. Every 5-10 seconds: Collects CPU %, RAM %, GPU %, Active Window Title,
   Logged-in User, and Top Running Processes.
3. On-Demand Screen Snap: When Teacher clicks 'Grab Screen' on portal,
   captures screen (< 50KB JPEG) and uploads within 2 seconds.
4. Remote Process Kill: Allows teacher to kill rogue games/processes.
5. On Shutdown/Logoff: Sends clean 🛑 OFFLINE message before system halts.
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
import shutil
from datetime import datetime
import urllib.request
import urllib.error

# Config Defaults
DEFAULT_BACKEND_URL = "https://labg418pc12.tailc8c1f6.ts.net"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_config.json")
HEARTBEAT_INTERVAL = 6  # seconds (ultra-responsive & very low bandwidth)

# 3rd-party library imports with graceful fallbacks
try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

try:
    import pynvml
    pynvml.nvmlInit()
    HAS_NVML = True
except Exception:
    HAS_NVML = False

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

try:
    import mss
    HAS_MSS = True
except ImportError:
    HAS_MSS = False


def load_config():
    """Loads pc_id and backend_url from agent_config.json, CLI args, or generates default."""
    config = {
        "pc_id": "PC-1",
        "backend_url": DEFAULT_BACKEND_URL,
        "heartbeat_interval": HEARTBEAT_INTERVAL
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                config.update(loaded)
        except Exception as e:
            print(f"[WARN] Failed to read config: {e}")
    else:
        # Auto-detect PC-ID from hostname if named e.g. PC-1, PC-2, LAB-PC-3
        hostname = socket.gethostname().upper()
        for i in range(1, 9):
            if f"PC-{i}" in hostname or f"PC{i}" in hostname:
                config["pc_id"] = f"PC-{i}"
                break

    # Command-line arguments override (e.g. python pc_telemetry_agent.py PC-2)
    if len(sys.argv) > 1:
        for i, arg in enumerate(sys.argv[1:], 1):
            upper_arg = arg.strip().upper()
            if upper_arg in ("--PC-ID", "-P") and i < len(sys.argv) - 1:
                config["pc_id"] = sys.argv[i + 1].strip().upper()
            elif upper_arg.startswith("PC-") or upper_arg.startswith("PC"):
                digits = "".join([c for c in upper_arg if c.isdigit()])
                config["pc_id"] = f"PC-{digits}" if digits else upper_arg
            elif upper_arg in ("--URL", "-U") and i < len(sys.argv) - 1:
                config["backend_url"] = sys.argv[i + 1].strip()

    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
    except Exception:
        pass

    return config


def get_active_window_info():
    """Returns the title and process of the currently active/focused window."""
    if platform.system() == "Windows":
        try:
            import ctypes
            from ctypes import wintypes
            hwnd = ctypes.windll.user32.GetForegroundWindow()
            if not hwnd:
                return "Desktop / Idle"
            length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
            title = ""
            if length > 0:
                buff = ctypes.create_unicode_buffer(length + 1)
                ctypes.windll.user32.GetWindowTextW(hwnd, buff, length + 1)
                title = buff.value.strip()

            pid = wintypes.DWORD()
            ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            proc_name = ""
            if pid.value and HAS_PSUTIL:
                try:
                    proc_name = psutil.Process(pid.value).name()
                except Exception:
                    pass

            if title and proc_name:
                return f"{title} ({proc_name})"
            elif title:
                return title
            elif proc_name:
                return proc_name
        except Exception:
            pass

    return "Active Desktop"


def get_top_processes(limit=5):
    """Collects top processes by CPU and RAM usage."""
    if not HAS_PSUTIL:
        return []
    procs = []
    try:
        for p in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
            try:
                info = p.info
                name = info.get('name') or ''
                if not name or name.lower() in ('system idle process', 'system', 'registry'):
                    continue
                procs.append({
                    "pid": info['pid'],
                    "name": name,
                    "cpu": round(info.get('cpu_percent') or 0.0, 1),
                    "ram": round(info.get('memory_percent') or 0.0, 1)
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        procs.sort(key=lambda x: (x['cpu'], x['ram']), reverse=True)
        return procs[:limit]
    except Exception:
        return []


def capture_screen_base64(pc_id="PC", max_width=1280):
    """
    Captures the active screen and compresses to base64 JPEG (< 60 KB).
    Gracefully handles headless/locked screen by rendering a fallback HUD status card.
    """
    import io
    import base64

    # Method 1: mss (Ultra Fast)
    if HAS_MSS and HAS_PIL:
        try:
            with mss.mss() as sct:
                monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                sct_img = sct.grab(monitor)
                img = Image.frombytes("RGB", sct_img.size, sct_img.bgra, "raw", "BGRX")
                if img.width > max_width:
                    scale = max_width / img.width
                    img = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=65, optimize=True)
                return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
        except Exception:
            pass

    # Method 2: PIL ImageGrab
    if HAS_PIL:
        try:
            from PIL import ImageGrab
            img = ImageGrab.grab()
            if img.width > max_width:
                scale = max_width / img.width
                img = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=65, optimize=True)
            return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
        except Exception:
            pass

    # Method 3: Fallback HUD Status Image (if screen locked or headless display)
    if HAS_PIL:
        try:
            width, height = 960, 540
            img = Image.new("RGB", (width, height), color=(15, 23, 42))
            draw = ImageDraw.Draw(img)
            active_win = get_active_window_info()
            user_str = os.getenv("USERNAME", "Active User")
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Border
            draw.rectangle([10, 10, width - 10, height - 10], outline=(59, 130, 246), width=3)
            # Text information
            draw.text((40, 50), f"WORKSTATION: {pc_id}", fill=(248, 250, 252))
            draw.text((40, 100), f"Status: Live Telemetry Active", fill=(34, 197, 94))
            draw.text((40, 150), f"Active Window: {active_win[:60]}", fill=(148, 163, 184))
            draw.text((40, 200), f"Logged User: {user_str}", fill=(148, 163, 184))
            draw.text((40, 250), f"Timestamp: {now_str}", fill=(148, 163, 184))
            draw.text((40, 320), "(Display is currently in standby / locked mode)", fill=(234, 179, 8))

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
        except Exception:
            pass

    return None


def execute_kill_command(target):
    """Terminates process by PID or Name."""
    target = target.strip()
    print(f"[ACTION] Terminating process '{target}'...")
    if HAS_PSUTIL:
        try:
            if target.isdigit():
                pid = int(target)
                p = psutil.Process(pid)
                p.terminate()
                return True
            else:
                killed = False
                for p in psutil.process_iter(['name']):
                    if p.info['name'] and p.info['name'].lower() == target.lower():
                        p.terminate()
                        killed = True
                return killed
        except Exception as e:
            print(f"[WARN] Kill failed via psutil: {e}")

    # Fallback to taskkill / kill
    if platform.system() == "Windows":
        cmd = ["taskkill", "/F", "/PID", target] if target.isdigit() else ["taskkill", "/F", "/IM", target]
    else:
        cmd = ["kill", "-9", target]
    try:
        subprocess.run(cmd, capture_output=True, timeout=3)
        return True
    except Exception:
        return False


def get_system_metrics():
    """Collects CPU, RAM, and GPU stats with zero-crash fallbacks."""
    metrics = {
        "cpu_percent": 0.0,
        "ram_percent": 0.0,
        "ram_used_gb": 0.0,
        "ram_total_gb": 0.0,
        "gpu_name": "",
        "gpu_percent": 0.0,
        "gpu_temp": 0.0,
        "gpu_vram_used_mb": 0.0,
        "gpu_vram_total_mb": 0.0,
        "ip_address": "",
        "os_info": f"{platform.system()} {platform.release()}",
        "boot_time": "",
        "logged_user": os.getenv("USERNAME", os.getenv("USER", "labuser"))
    }

    # 1. IP Address
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        metrics["ip_address"] = s.getsockname()[0]
        s.close()
    except Exception:
        try:
            metrics["ip_address"] = socket.gethostbyname(socket.gethostname())
        except Exception:
            metrics["ip_address"] = "127.0.0.1"

    # 2. CPU & RAM (psutil)
    if HAS_PSUTIL:
        try:
            metrics["cpu_percent"] = round(psutil.cpu_percent(interval=None), 1)
            mem = psutil.virtual_memory()
            metrics["ram_percent"] = round(mem.percent, 1)
            metrics["ram_used_gb"] = round(mem.used / (1024 ** 3), 1)
            metrics["ram_total_gb"] = round(mem.total / (1024 ** 3), 1)
            btime = datetime.fromtimestamp(psutil.boot_time())
            metrics["boot_time"] = btime.strftime("%Y-%m-%d %H:%M:%S")
        except Exception as e:
            print(f"[WARN] psutil error: {e}")

    # 3. GPU Telemetry (NVIDIA NVML)
    if HAS_NVML:
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            metrics["gpu_name"] = pynvml.nvmlDeviceGetName(handle)
            if isinstance(metrics["gpu_name"], bytes):
                metrics["gpu_name"] = metrics["gpu_name"].decode("utf-8")
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            metrics["gpu_percent"] = float(util.gpu)
            try:
                metrics["gpu_temp"] = float(pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU))
            except Exception:
                metrics["gpu_temp"] = 0.0
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            metrics["gpu_vram_used_mb"] = round(mem_info.used / (1024 ** 2), 0)
            metrics["gpu_vram_total_mb"] = round(mem_info.total / (1024 ** 2), 0)
        except Exception:
            pass

    # 4. Fallback to nvidia-smi CLI
    if not metrics["gpu_name"]:
        nvsmi = shutil.which("nvidia-smi")
        if not nvsmi:
            for cand in [
                r"C:\Windows\System32\nvidia-smi.exe",
                r"C:\Program Files\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
                "/usr/bin/nvidia-smi",
                "/usr/local/cuda/bin/nvidia-smi"
            ]:
                if os.path.exists(cand):
                    nvsmi = cand
                    break
        if nvsmi:
            try:
                cmd = [
                    nvsmi,
                    "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
                    "--format=csv,noheader,nounits"
                ]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
                if proc.returncode == 0 and proc.stdout.strip():
                    first_line = proc.stdout.strip().splitlines()[0]
                    parts = [p.strip() for p in first_line.split(",")]
                    if len(parts) >= 5:
                        metrics["gpu_name"] = parts[0]
                        metrics["gpu_percent"] = float(parts[1] or 0.0)
                        metrics["gpu_temp"] = float(parts[2] or 0.0)
                        metrics["gpu_vram_used_mb"] = round(float(parts[3] or 0.0), 0)
                        metrics["gpu_vram_total_mb"] = round(float(parts[4] or 0.0), 0)
            except Exception:
                pass

    return metrics


def send_post_json(url, data_dict, timeout=6):
    """Sends JSON POST request and returns (status_bool, response_dict)."""
    try:
        data_bytes = json.dumps(data_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AILab-WorkstationAgent/2.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            try:
                res_json = json.loads(body)
            except Exception:
                res_json = {}
            return True, res_json
    except Exception as e:
        return False, {}


def main():
    config = load_config()
    pc_id = config["pc_id"].upper()
    backend_url = config["backend_url"].rstrip("/")
    interval = config.get("heartbeat_interval", HEARTBEAT_INTERVAL)

    heartbeat_endpoint = f"{backend_url}/api/pc/heartbeat"
    screenshot_endpoint = f"{backend_url}/api/pc/screenshot"
    offline_endpoint = f"{backend_url}/api/pc/offline"

    print("=" * 65)
    print(f"🔬 AI LAB Workstation Telemetry & Monitoring Agent [{pc_id}]")
    print(f"📡 Backend URL : {backend_url}")
    print(f"⏱️ Heartbeat   : Every {interval} seconds")
    print(f"📸 Snapshots   : On-Demand & Instant Upload")
    print("=" * 65)

    def on_exit():
        """Clean shutdown notification when PC shuts down or script is stopped."""
        print(f"\n[OFFLINE] Sending shutdown event for {pc_id}...")
        send_post_json(offline_endpoint, {"pc_id": pc_id}, timeout=3)
        if HAS_NVML:
            try:
                pynvml.nvmlShutdown()
            except Exception:
                pass

    # Register exit handlers
    atexit.register(on_exit)
    try:
        signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
        signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    except Exception:
        pass

    if HAS_PSUTIL:
        psutil.cpu_percent(interval=None)

    # Main Agent Loop
    while True:
        try:
            stats = get_system_metrics()
            active_win = get_active_window_info()
            top_procs = get_top_processes(limit=5)

            payload = {
                "pc_id": pc_id,
                "active_window": active_win,
                "top_processes": top_procs,
                **stats
            }

            success, res_data = send_post_json(heartbeat_endpoint, payload)
            now_str = datetime.now().strftime("%H:%M:%S")

            if success:
                gpu_str = f" | GPU: {stats['gpu_percent']}%" if stats['gpu_name'] else ""
                win_short = (active_win[:28] + "..") if len(active_win) > 30 else active_win
                print(f"[{now_str}] 🟢 [{pc_id}] OK | CPU: {stats['cpu_percent']}% | RAM: {stats['ram_percent']}% | Focus: '{win_short}'{gpu_str}")

                # Check if a command was returned (e.g. capture_screen, shutdown, restart, lock, kill:pid)
                command = res_data.get("command")
                if command:
                    cmd_clean = command.strip()
                    cmd_lower = cmd_clean.lower()
                    print(f"[{now_str}] ⚡ Received Remote Command: '{cmd_clean}'")

                    if cmd_clean == "capture_screen":
                        print(f"[{now_str}] 📸 On-demand Screen Grab requested by Teacher! Capturing...")
                        snap_b64 = capture_screen_base64(pc_id=pc_id)
                        if snap_b64:
                            snap_ok, _ = send_post_json(screenshot_endpoint, {
                                "pc_id": pc_id,
                                "image_base64": snap_b64
                            })
                            if snap_ok:
                                print(f"[{now_str}] 🚀 Screen Snapshot uploaded successfully to Teacher Portal!")
                            else:
                                print(f"[{now_str}] ⚠️ Failed to upload screenshot to backend")

                    elif cmd_lower in ("shutdown", "poweroff", "shutdown:force"):
                        print(f"[{now_str}] 🛑 SHUTDOWN INITIATED by Lab Administrator: Shutting down workstation in 5s...")
                        try:
                            subprocess.Popen(["shutdown", "/s", "/f", "/t", "5", "/c", "AI Lab Administrator: Remote shutdown sequence initiated."])
                        except Exception as se:
                            print(f"[SHUTDOWN-ERR] {se}")

                    elif cmd_lower in ("restart", "reboot", "restart:force"):
                        print(f"[{now_str}] 🔄 RESTART INITIATED by Lab Administrator: Rebooting workstation in 5s...")
                        try:
                            subprocess.Popen(["shutdown", "/r", "/f", "/t", "5", "/c", "AI Lab Administrator: Remote reboot sequence initiated."])
                        except Exception as re:
                            print(f"[REBOOT-ERR] {re}")

                    elif cmd_lower in ("lock", "lockscreen"):
                        print(f"[{now_str}] 🔒 LOCK INITIATED: Locking Windows workstation...")
                        try:
                            import ctypes
                            ctypes.windll.user32.LockWorkStation()
                        except Exception as le:
                            try:
                                subprocess.Popen(["rundll32.exe", "user32.dll,LockWorkStation"])
                            except Exception:
                                print(f"[LOCK-ERR] {le}")

                    elif cmd_clean.startswith("warn:"):
                        msg = cmd_clean.split(":", 1)[1].strip()
                        print(f"[{now_str}] ⚠️ LAB NOTICE: '{msg}'")
                        try:
                            import ctypes
                            import threading
                            threading.Thread(
                                target=lambda: ctypes.windll.user32.MessageBoxW(0, msg, "AI Lab Administrator Notice", 0x30 | 0x40000),
                                daemon=True
                            ).start()
                        except Exception as we:
                            print(f"[WARN-ERR] {we}")

                    elif cmd_clean.startswith("kill:"):
                        target_kill = cmd_clean.split(":", 1)[1]
                        execute_kill_command(target_kill)
            else:
                print(f"[{now_str}] ⚠️ [{pc_id}] Backend unreachable (will retry in {interval}s)")

        except Exception as e:
            print(f"[ERR] Unexpected loop error: {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
