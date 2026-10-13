#!/usr/bin/env python3
"""
dgx_telemetry_agent.py — Universal Standalone DGX Telemetry & Heartbeat Agent
=============================================================================
Designed specifically for NVIDIA DGX Stations / Linux GPU Servers / Lab PCs:
- Zero pip dependencies (Uses pure Python standard library + native nvidia-smi)
- Streams: Online Status, CPU Load, RAM (Used/Total), Multi-GPU utilization & VRAM
- Auto-registers with Lab Central Backend via permanent Tailscale Funnel / LAN IP
- Clean Shutdown / SIGTERM offline notification hook

Usage:
    python3 dgx_telemetry_agent.py
    python3 dgx_telemetry_agent.py --pc-id DGX-1
    python3 dgx_telemetry_agent.py --pc-id PC-2 --url https://labg418pc12.tailc8c1f6.ts.net
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
import argparse
from datetime import datetime
import urllib.request
import urllib.error

# DEFAULT CENTRAL BACKEND URL
DEFAULT_BACKEND_URL = "https://labg418pc12.tailc8c1f6.ts.net"
DEFAULT_INTERVAL = 10  # Seconds between heartbeats


def get_cpu_and_uptime():
    """Reads Linux /proc/stat and /proc/uptime without psutil."""
    cpu_percent = 0.0
    boot_time_str = ""
    try:
        # Method 1: Read /proc/stat (Delta load)
        def read_stat():
            with open("/proc/stat", "r") as f:
                fields = [float(x) for x in f.readline().strip().split()[1:8]]
                idle = fields[3] + fields[4]
                total = sum(fields)
                return idle, total

        idle1, total1 = read_stat()
        time.sleep(0.15)
        idle2, total2 = read_stat()
        d_idle = idle2 - idle1
        d_total = total2 - total1
        if d_total > 0:
            cpu_percent = round(100.0 * (1.0 - (d_idle / d_total)), 1)
    except Exception:
        # Fallback to load average
        try:
            load1 = os.getloadavg()[0]
            cores = os.cpu_count() or 1
            cpu_percent = round(min(100.0, (load1 / cores) * 100.0), 1)
        except Exception:
            cpu_percent = 0.0

    # Boot time
    try:
        with open("/proc/uptime", "r") as f:
            uptime_seconds = float(f.readline().split()[0])
            btime = datetime.now().timestamp() - uptime_seconds
            boot_time_str = datetime.fromtimestamp(btime).strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        pass

    return cpu_percent, boot_time_str


def get_memory_info():
    """Reads Linux /proc/meminfo without psutil."""
    ram_percent = 0.0
    ram_used_gb = 0.0
    ram_total_gb = 0.0
    try:
        mem = {}
        with open("/proc/meminfo", "r") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    k = parts[0].strip()
                    v = parts[1].strip().split()[0]
                    mem[k] = float(v)  # in kB

        total_kb = mem.get("MemTotal", 0.0)
        free_kb = mem.get("MemFree", 0.0)
        avail_kb = mem.get("MemAvailable", free_kb)

        if total_kb > 0:
            used_kb = total_kb - avail_kb
            ram_percent = round((used_kb / total_kb) * 100.0, 1)
            ram_used_gb = round(used_kb / (1024.0 * 1024.0), 1)
            ram_total_gb = round(total_kb / (1024.0 * 1024.0), 1)
    except Exception as e:
        pass
    return ram_percent, ram_used_gb, ram_total_gb


def get_nvidia_dgx_gpu_info():
    """Queries native nvidia-smi for all GPUs in the DGX node."""
    gpu_data = {
        "gpu_name": "",
        "gpu_percent": 0.0,
        "gpu_temp": 0.0,
        "gpu_vram_used_mb": 0.0,
        "gpu_vram_total_mb": 0.0
    }
    try:
        nvsmi = shutil.which("nvidia-smi")
        if not nvsmi:
            for cand in ["/usr/bin/nvidia-smi", "/usr/local/cuda/bin/nvidia-smi", "/usr/lib/wsl/lib/nvidia-smi"]:
                if os.path.exists(cand):
                    nvsmi = cand
                    break
        if not nvsmi:
            nvsmi = "nvidia-smi"

        # Query comma-separated GPU name, utilization, temperature, memory.used, memory.total
        cmd = [
            nvsmi,
            "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
            "--format=csv,noheader,nounits"
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=4)
        if proc.returncode == 0 and proc.stdout.strip():
            lines = [l.strip() for l in proc.stdout.strip().splitlines() if l.strip()]
            gpu_count = len(lines)
            names = []
            utils = []
            temps = []
            vram_used = 0.0
            vram_total = 0.0

            for line in lines:
                parts = [p.strip() for p in line.split(",")]
                if len(parts) >= 5:
                    names.append(parts[0])
                    utils.append(float(parts[1] or 0.0))
                    temps.append(float(parts[2] or 0.0))
                    vram_used += float(parts[3] or 0.0)
                    vram_total += float(parts[4] or 0.0)

            if names:
                if gpu_count > 1:
                    gpu_data["gpu_name"] = f"{gpu_count}x {names[0]}"
                else:
                    gpu_data["gpu_name"] = names[0]

                # Average GPU load and temperature across accelerators
                gpu_data["gpu_percent"] = round(sum(utils) / len(utils), 1) if utils else 0.0
                gpu_data["gpu_temp"] = round(max(temps), 1) if temps else 0.0
                gpu_data["gpu_vram_used_mb"] = round(vram_used, 0)
                gpu_data["gpu_vram_total_mb"] = round(vram_total, 0)
    except Exception:
        # Non-NVIDIA host or driver not loaded
        pass

    return gpu_data


def get_local_ip():
    """Detects active LAN / network IP."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"


def send_post(url, data_dict, timeout=6):
    """Sends JSON POST request via standard library urllib."""
    try:
        data_bytes = json.dumps(data_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AILab-DGXAgent/1.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 201)
    except Exception:
        return False


def resolve_pc_id(arg_id=None):
    """Determines PC ID from CLI argument, environment variable, or hostname."""
    if arg_id and arg_id.strip():
        return arg_id.strip().upper()

    env_id = os.environ.get("AI_LAB_PC_ID", "").strip()
    if env_id:
        return env_id.upper()

    hostname = socket.gethostname().upper()
    for i in range(1, 9):
        if f"PC-{i}" in hostname or f"PC{i}" in hostname or f"DGX-{i}" in hostname or f"DGX{i}" in hostname:
            return f"PC-{i}"

    # Default if undetectable
    return hostname


def main():
    parser = argparse.ArgumentParser(description="AI/ML LAB Workstation & DGX Telemetry Daemon")
    parser.add_argument("--pc-id", "-i", default="", help="PC Identifier (e.g. PC-1, PC-2, DGX-1)")
    parser.add_argument("--url", "-u", default=DEFAULT_BACKEND_URL, help="Backend Server URL")
    parser.add_argument("--interval", "-t", type=int, default=DEFAULT_INTERVAL, help="Heartbeat interval in seconds")
    args = parser.parse_args()

    pc_id = resolve_pc_id(args.pc_id)
    backend_url = args.url.rstrip("/")
    interval = max(3, args.interval)

    heartbeat_url = f"{backend_url}/api/pc/heartbeat"
    offline_url = f"{backend_url}/api/pc/offline"

    print("=" * 68)
    print(f"🚀 AI/ML LAB DGX & WORKSTATION TELEMETRY AGENT")
    print(f"🖥️ Target PC ID : {pc_id}")
    print(f"🌐 Backend URL  : {backend_url}")
    print(f"⏱️ Interval     : {interval} seconds")
    print(f"💻 System       : {platform.system()} {platform.release()} ({platform.machine()})")
    print("=" * 68)

    def on_exit():
        print(f"\n[OFFLINE] Sending shutdown broadcast for {pc_id}...")
        send_post(offline_url, {"pc_id": pc_id}, timeout=3)
        print("[OFFLINE] Notification delivered. Goodbye.")

    atexit.register(on_exit)
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))

    while True:
        try:
            cpu_pct, btime = get_cpu_and_uptime()
            ram_pct, ram_used, ram_total = get_memory_info()
            gpu_stats = get_nvidia_dgx_gpu_info()
            ip_addr = get_local_ip()

            payload = {
                "pc_id": pc_id,
                "cpu_percent": cpu_pct,
                "ram_percent": ram_pct,
                "ram_used_gb": ram_used,
                "ram_total_gb": ram_total,
                "gpu_name": gpu_stats["gpu_name"],
                "gpu_percent": gpu_stats["gpu_percent"],
                "gpu_temp": gpu_stats.get("gpu_temp", 0.0),
                "gpu_vram_used_mb": gpu_stats["gpu_vram_used_mb"],
                "gpu_vram_total_mb": gpu_stats["gpu_vram_total_mb"],
                "ip_address": ip_addr,
                "os_info": f"{platform.system()} {platform.release()}",
                "boot_time": btime
            }

            success = send_post(heartbeat_url, payload)
            t_now = datetime.now().strftime("%H:%M:%S")

            if success:
                gpu_tag = f" | GPU: {gpu_stats['gpu_percent']}% ({gpu_stats['gpu_name']})" if gpu_stats['gpu_name'] else ""
                print(f"[{t_now}] 🟢 [{pc_id}] OK | CPU: {cpu_pct}% | RAM: {ram_pct}% ({ram_used}/{ram_total} GB){gpu_tag}")
            else:
                print(f"[{t_now}] ⚠️ [{pc_id}] Backend unreachable ({backend_url}). Retrying in {interval}s...")

        except Exception as e:
            print(f"[ERR] Telemetry loop exception: {e}")

        time.sleep(interval)


if __name__ == "__main__":
    main()
