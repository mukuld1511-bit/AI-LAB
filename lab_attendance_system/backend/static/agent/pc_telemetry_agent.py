"""
pc_telemetry_agent.py — Lightweight Lab Workstation Heartbeat & Telemetry Daemon
---------------------------------------------------------------------------------
Runs automatically in the background on each Lab PC (PC-1 to PC-8).
1. On Startup: Pings central backend to mark PC as 🟢 ONLINE.
2. Every 10 seconds: Collects CPU %, RAM %, and GPU (NVIDIA/CUDA) stats and sends heartbeat.
3. On Shutdown/Logoff: Sends clean 🛑 OFFLINE message before system halts.
4. Auto-detects local PC ID from config file or Windows hostname.
"""

import os
import sys
import time
import json
import socket
import platform
import atexit
import signal
from datetime import datetime
import urllib.request
import urllib.error

# Config Defaults
DEFAULT_BACKEND_URL = "https://labg418pc12.tailc8c1f6.ts.net"
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent_config.json")
HEARTBEAT_INTERVAL = 10  # seconds

# Optional 3rd-party library imports with graceful built-in fallbacks
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


import subprocess
import shutil

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
                # Normalize e.g. PC2 -> PC-2, PC-2 -> PC-2
                digits = "".join([c for c in upper_arg if c.isdigit()])
                config["pc_id"] = f"PC-{digits}" if digits else upper_arg
            elif upper_arg in ("--URL", "-U") and i < len(sys.argv) - 1:
                config["backend_url"] = sys.argv[i + 1].strip()

    # Save active config so next runs remember this PC ID
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4)
    except Exception:
        pass

    return config


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
        "boot_time": ""
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

    # 4. Fallback to nvidia-smi CLI if NVML was not active or returned empty
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


def send_post(url, data_dict, timeout=6):
    """Sends JSON POST request via standard library urllib."""
    try:
        data_bytes = json.dumps(data_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AILab-WorkstationAgent/1.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 201)
    except Exception as e:
        return False


def main():
    config = load_config()
    pc_id = config["pc_id"].upper()
    backend_url = config["backend_url"].rstrip("/")
    interval = config.get("heartbeat_interval", 10)

    heartbeat_endpoint = f"{backend_url}/api/pc/heartbeat"
    offline_endpoint = f"{backend_url}/api/pc/offline"

    print("=" * 65)
    print(f"🔬 AI LAB Workstation Telemetry Agent [{pc_id}]")
    print(f"📡 Backend URL : {backend_url}")
    print(f"⏱️ Interval    : {interval} seconds")
    print("=" * 65)

    def on_exit():
        """Clean shutdown notification when PC shuts down or script is stopped."""
        print(f"\n[OFFLINE] Sending shutdown event for {pc_id}...")
        send_post(offline_endpoint, {"pc_id": pc_id}, timeout=3)
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

    # Prime psutil CPU percent
    if HAS_PSUTIL:
        psutil.cpu_percent(interval=None)

    # Main Heartbeat Loop
    while True:
        try:
            stats = get_system_metrics()
            payload = {
                "pc_id": pc_id,
                **stats
            }

            success = send_post(heartbeat_endpoint, payload)
            now_str = datetime.now().strftime("%H:%M:%S")

            if success:
                gpu_str = f" | GPU: {stats['gpu_percent']}%" if stats['gpu_name'] else ""
                print(f"[{now_str}] 🟢 [{pc_id}] Heartbeat OK | CPU: {stats['cpu_percent']}% | RAM: {stats['ram_percent']}%{gpu_str}")
            else:
                print(f"[{now_str}] ⚠️ [{pc_id}] Backend unreachable (will retry in {interval}s)")

        except Exception as e:
            print(f"[ERR] Unexpected loop error: {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
