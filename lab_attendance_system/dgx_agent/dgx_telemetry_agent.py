#!/usr/bin/env python3
"""
dgx_telemetry_agent.py — Universal Standalone DGX Telemetry & Heartbeat Agent
=============================================================================
Designed specifically for NVIDIA DGX Stations / Linux GPU Servers / Lab PCs:
- Zero pip dependencies (Uses pure Python standard library + native nvidia-smi)
- Streams: Online Status, CPU Load, RAM (Used/Total), Multi-GPU utilization & VRAM
- Auto-registers with Lab Central Backend via permanent Tailscale Funnel / LAN IP
- Real Desktop Graphical Screen Capture (Wayland GNOME / X11 / Xorg)
- Clean Shutdown / SIGTERM offline notification hook

Usage:
    python3 dgx_telemetry_agent.py
    python3 dgx_telemetry_agent.py --pc-id PC-5
    python3 dgx_telemetry_agent.py --pc-id DGX-1 --url https://labg418pc12.tailc8c1f6.ts.net
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
import shutil
import glob
from datetime import datetime
import urllib.request
import urllib.error

# DEFAULT CENTRAL BACKEND URL
DEFAULT_BACKEND_URL = "https://labg418pc12.tailc8c1f6.ts.net"
FALLBACK_BACKEND_URL = "http://10.9.6.255:8000"
DEFAULT_INTERVAL = 4  # Seconds between heartbeats (fast responsive capture)


def ensure_healthy_dns():
    """On Linux, checks if public DNS (8.8.8.8) is configured. If missing and running as root, appends it."""
    if platform.system() == "Linux" and os.path.exists("/etc/resolv.conf"):
        try:
            with open("/etc/resolv.conf", "r") as rf:
                resolv = rf.read()
            if "8.8.8.8" not in resolv and "1.1.1.1" not in resolv:
                if hasattr(os, "geteuid") and os.geteuid() == 0:
                    with open("/etc/resolv.conf", "a") as af:
                        af.write("\nnameserver 8.8.8.8\nnameserver 1.1.1.1\n")
                    print("[NET] 🌐 Auto-injected public DNS (8.8.8.8) into /etc/resolv.conf")
        except Exception:
            pass

IGNORED_PROCESS_NAMES = {
    "ps", "top", "htop", "grep", "awk", "sed", "sh", "bash", "zsh", "dash",
    "systemd", "sshd", "sleep", "sort", "head", "tail", "cut", "cat",
    "dbus-daemon", "pulseaudio", "pipewire", "journald", "snapd"
}


def get_cpu_and_uptime():
    """Reads Linux /proc/stat and /proc/uptime without psutil."""
    cpu_percent = 0.0
    boot_time_str = ""
    try:
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
    except Exception:
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

                gpu_data["gpu_percent"] = round(sum(utils) / len(utils), 1) if utils else 0.0
                gpu_data["gpu_temp"] = round(max(temps), 1) if temps else 0.0
                gpu_data["gpu_vram_used_mb"] = round(vram_used, 0)
                gpu_data["gpu_vram_total_mb"] = round(vram_total, 0)
    except Exception:
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


def send_post_json(url, data_dict, timeout=6):
    """Sends JSON POST request via standard library urllib and returns (success, parsed_dict)."""
    try:
        data_bytes = json.dumps(data_dict).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "AILab-DGXAgent/2.0"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status in (200, 201):
                try:
                    res_body = json.loads(resp.read().decode("utf-8"))
                    return True, res_body
                except Exception:
                    return True, {}
            return False, {}
    except Exception:
        return False, {}


def send_post(url, data_dict, timeout=6):
    success, _ = send_post_json(url, data_dict, timeout=timeout)
    return success


def get_linux_top_processes():
    """Queries top 5 real workload processes using native ps, filtering out transient inspection tools and capping CPU at 100%."""
    procs = []
    my_pid = os.getpid()
    try:
        cmd = ["ps", "-eo", "pid,%cpu,%mem,comm", "--sort=-%cpu"]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
        if proc.returncode == 0:
            lines = proc.stdout.strip().splitlines()
            for line in lines[1:30]:  # Inspect top 30 processes to find 5 real applications
                parts = line.strip().split(None, 3)
                if len(parts) >= 4:
                    try:
                        pid = int(parts[0])
                        raw_cpu = float(parts[1])
                        raw_mem = float(parts[2])
                        p_name = parts[3].strip()

                        # Exclude agent's own PID
                        if pid == my_pid:
                            continue

                        # Exclude transient inspection commands & kernel workers
                        clean_name = p_name.lower()
                        if clean_name in IGNORED_PROCESS_NAMES:
                            continue
                        if clean_name.startswith("kworker") or clean_name.startswith("systemd-"):
                            continue

                        # Cap CPU usage at 100.0% max so UI never shows 200% glitch
                        capped_cpu = min(100.0, round(raw_cpu, 1))

                        procs.append({
                            "pid": pid,
                            "cpu": capped_cpu,
                            "ram": round(raw_mem, 1),
                            "name": p_name
                        })

                        if len(procs) >= 5:
                            break
                    except Exception:
                        pass
    except Exception:
        pass
    return procs


def get_desktop_session_info():
    """
    Finds the active graphical desktop user and environment variables by inspecting:
    1. Running GUI processes in /proc (e.g. Chrome, Antigravity IDE, GNOME Shell, Xorg, Firefox)
    2. Active display sockets in /tmp/.X11-unix/ and /run/user/<uid>/
    3. Active sessions via who / loginctl / /run/user
    """
    info = {
        "user": None,
        "uid": None,
        "env": os.environ.copy()
    }

    target_env_keys = ("DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "USER", "LOGNAME")
    gui_patterns = ("chrome", "google-chrome", "antigravity", "antigravity-ide", "code", "firefox", "gnome-shell", "xorg", "xwayland", "nautilus", "gnome-session", "terminal")

    # 1. Prioritize scanning /proc/[0-9]* for active graphical application processes
    all_pids = glob.glob("/proc/[0-9]*")
    gui_pids = []
    other_pids = []

    for p_dir in all_pids:
        try:
            comm_file = f"{p_dir}/comm"
            if os.path.exists(comm_file):
                with open(comm_file, "r", errors="ignore") as f:
                    comm = f.read().strip().lower()
                if any(g in comm for g in gui_patterns):
                    gui_pids.append(p_dir)
                    continue
            other_pids.append(p_dir)
        except Exception:
            other_pids.append(p_dir)

    for p_dir in (gui_pids + other_pids):
        try:
            env_file = f"{p_dir}/environ"
            if not os.path.exists(env_file):
                continue
            with open(env_file, "rb") as f:
                raw = f.read(8192).decode("utf-8", errors="ignore")

            if "DISPLAY=" in raw or "WAYLAND_DISPLAY=" in raw or "DBUS_SESSION_BUS_ADDRESS=" in raw:
                p_env = {}
                for item in raw.split("\0"):
                    if "=" in item:
                        k, v = item.split("=", 1)
                        if k in target_env_keys and v:
                            p_env[k] = v

                stat_val = os.stat(p_dir)
                p_uid = stat_val.st_uid

                # Prioritize human desktop user (UID >= 1000)
                if p_uid >= 1000:
                    info["uid"] = p_uid
                    try:
                        import pwd
                        info["user"] = pwd.getpwuid(p_uid).pw_name
                    except Exception:
                        info["user"] = p_env.get("USER") or p_env.get("LOGNAME")
                    info["env"].update(p_env)
                    if (info["env"].get("DISPLAY") or info["env"].get("WAYLAND_DISPLAY")) and p_dir in gui_pids:
                        break
                elif not info["env"].get("DISPLAY") and p_env.get("DISPLAY"):
                    info["env"].update(p_env)
        except Exception:
            continue

    # 2. If user not resolved, detect logged-in human user
    if not info["user"] or info["user"] == "root":
        try:
            proc = subprocess.run(["who", "-u"], capture_output=True, text=True, timeout=1)
            if proc.returncode == 0 and proc.stdout.strip():
                first_line = proc.stdout.strip().splitlines()[0]
                parts = first_line.split()
                if len(parts) >= 1 and parts[0] != "root":
                    info["user"] = parts[0]
                    try:
                        import pwd
                        info["uid"] = pwd.getpwnam(parts[0]).pw_uid
                    except Exception:
                        pass
        except Exception:
            pass

    if not info["uid"]:
        run_dirs = glob.glob("/run/user/[0-9]*")
        for rd in run_dirs:
            try:
                u_id = int(os.path.basename(rd))
                if u_id >= 1000:
                    info["uid"] = u_id
                    try:
                        import pwd
                        info["user"] = pwd.getpwuid(u_id).pw_name
                    except Exception:
                        pass
                    break
            except Exception:
                pass

    if not info["user"]:
        info["user"] = os.environ.get("USER") or os.environ.get("LOGNAME") or "piet"
    if not info["uid"] and hasattr(os, "getuid"):
        info["uid"] = os.getuid()

    uid = info["uid"]
    u = info["user"]

    # Fill default runtime dir and DBUS address if uid exists
    if uid:
        if not info["env"].get("XDG_RUNTIME_DIR") and os.path.exists(f"/run/user/{uid}"):
            info["env"]["XDG_RUNTIME_DIR"] = f"/run/user/{uid}"
        if not info["env"].get("DBUS_SESSION_BUS_ADDRESS"):
            bus_sock = f"/run/user/{uid}/bus"
            if os.path.exists(bus_sock):
                info["env"]["DBUS_SESSION_BUS_ADDRESS"] = f"unix:path={bus_sock}"
        if not info["env"].get("WAYLAND_DISPLAY"):
            w_socks = glob.glob(f"/run/user/{uid}/wayland-*")
            if w_socks:
                info["env"]["WAYLAND_DISPLAY"] = os.path.basename(w_socks[0])

    # Verify or detect DISPLAY from active Unix sockets
    x_sockets = glob.glob("/tmp/.X11-unix/X*")
    detected_disp = info["env"].get("DISPLAY")
    if not detected_disp:
        if x_sockets:
            # Sort and pick highest or active socket (e.g. /tmp/.X11-unix/X1 -> :1 or X0 -> :0)
            sock_names = sorted([os.path.basename(s).replace("X", ":") for s in x_sockets], reverse=True)
            info["env"]["DISPLAY"] = sock_names[0]
        else:
            info["env"]["DISPLAY"] = ":0"

    # Search for Xauthority if missing
    if not info["env"].get("XAUTHORITY") and u:
        for cand in [
            f"/run/user/{uid}/gdm/Xauthority",
            f"/run/user/{uid}/.Xauthority",
            f"/run/user/{uid}/.mutter-Xwaylandauth.*",
            f"/run/user/{uid}/xauth_*",
            f"/home/{u}/.Xauthority",
            f"/home/{u}/.Xauthority-*",
            "/root/.Xauthority"
        ]:
            m = glob.glob(cand)
            if m and os.path.exists(m[0]):
                info["env"]["XAUTHORITY"] = m[0]
                break

    # Apply detected DISPLAY & XAUTHORITY to Python's own environment!
    for k in ("DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "WAYLAND_DISPLAY"):
        if info["env"].get(k):
            os.environ[k] = info["env"][k]

    return info


def run_in_desktop_context(cmd_list, session_info, timeout=5):
    """
    Executes a shell command inside the active desktop user's context.
    Explicitly injects DISPLAY, XAUTHORITY, DBUS_SESSION_BUS_ADDRESS so neither
    runuser nor su drops them.
    """
    user = session_info.get("user")
    env = session_info.get("env", {})

    # Build explicit env injection arguments: ["env", "DISPLAY=:0", "XAUTHORITY=...", ...]
    env_inject = ["env"]
    for k in ("DISPLAY", "XAUTHORITY", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "WAYLAND_DISPLAY"):
        if env.get(k):
            env_inject.append(f"{k}={env[k]}")

    full_cmd = env_inject + cmd_list

    # If running as root and desktop user is non-root, run as desktop user
    if hasattr(os, "geteuid") and os.geteuid() == 0 and user and user != "root":
        # 1. runuser with explicit env
        try:
            r_cmd = ["runuser", "-u", user, "--"] + full_cmd
            res = subprocess.run(r_cmd, env=env, capture_output=True, timeout=timeout)
            if res.returncode == 0:
                return res
        except Exception:
            pass

        # 2. su with explicit env
        try:
            import shlex
            cmd_str = " ".join(shlex.quote(c) for c in full_cmd)
            s_cmd = ["su", user, "-c", cmd_str]
            res = subprocess.run(s_cmd, env=env, capture_output=True, timeout=timeout)
            if res.returncode == 0:
                return res
        except Exception:
            pass

    # Direct execution with env injection
    try:
        res = subprocess.run(full_cmd, env=env, capture_output=True, timeout=timeout)
        if res.returncode == 0:
            return res
    except Exception:
        pass

    try:
        return subprocess.run(cmd_list, env=env, capture_output=True, timeout=timeout)
    except Exception:
        return None


def get_linux_active_info():
    """Gets logged in users and active foreground session info."""
    desktop_session = get_desktop_session_info()
    user = desktop_session.get("user") or os.environ.get("USER") or os.environ.get("LOGNAME") or "root"
    active_win = ""

    # Try xdotool inside desktop session context
    try:
        proc = run_in_desktop_context(["xdotool", "getwindowfocus", "getwindowname"], desktop_session, timeout=1)
        if proc and proc.returncode == 0 and proc.stdout.decode("utf-8", errors="ignore").strip():
            active_win = proc.stdout.decode("utf-8", errors="ignore").strip()
    except Exception:
        pass

    # Try who -u if window name not resolved
    if not active_win:
        try:
            proc = subprocess.run(["who", "-u"], capture_output=True, text=True, timeout=1)
            if proc.returncode == 0 and proc.stdout.strip():
                first_line = proc.stdout.strip().splitlines()[0]
                parts = first_line.split()
                if len(parts) >= 1:
                    active_win = f"Active Desktop Session ({parts[0]})"
        except Exception:
            pass

    return user, active_win or "Linux DGX Workspace"


def compress_and_b64(img_path):
    """Compresses an image file to max 1600x900 JPEG quality 65 and returns base64."""
    import base64
    try:
        from PIL import Image
        import io
        with Image.open(img_path) as im:
            im.thumbnail((1600, 900))
            buf = io.BytesIO()
            im.convert("RGB").save(buf, format="JPEG", quality=65)
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        try:
            os.remove(img_path)
        except Exception:
            pass
        return b64
    except Exception:
        try:
            with open(img_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            try:
                os.remove(img_path)
            except Exception:
                pass
            return b64
        except Exception:
            return None


def capture_linux_screen(pc_id):
    """
    Captures real desktop display on Linux using a multi-tiered cascade:
    0. Python mss (Pure X11 protocol directly to X server - fastest & zero external binaries)
    1. scrot CLI (Standard X11 screenshot tool)
    2. ImageMagick import CLI (Robust root window grabber)
    3. grim CLI (Native Wayland compositor grabber)
    4. gnome-screenshot CLI
    5. GNOME Shell DBus API (gdbus / dbus-send)
    6. xwd + convert CLI
    7. ffmpeg x11grab CLI
    8. PIL ImageGrab with explicit display
    """
    session = get_desktop_session_info()
    user = session.get("user") or "piet"
    disp = session["env"].get("DISPLAY", ":0")
    tmp_png = f"/tmp/snap_{pc_id}.png"
    tmp_jpg = f"/tmp/snap_{pc_id}.jpg"
    tmp_xwd = f"/tmp/snap_{pc_id}.xwd"

    # Candidate displays to probe
    candidate_displays = [disp]
    for d in (":0", ":1", ":2"):
        if d not in candidate_displays:
            candidate_displays.append(d)

    print(f"[CAPTURE] Attempting screen grab for user '{user}' on displays {candidate_displays}...")

    # Clean old files
    for p in (tmp_png, tmp_jpg, tmp_xwd):
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass

    # Authorize local display access via xhost
    for xhost_cmd in (["xhost", "+local:"], ["xhost", "+SI:localuser:root"], ["xhost", "+"]):
        try:
            run_in_desktop_context(xhost_cmd, session, timeout=2)
        except Exception:
            pass

    # Strategy 0: Python mss (Native pure-python X11 screen capture protocol)
    try:
        import mss
        import mss.tools
        for test_disp in candidate_displays:
            try:
                os.environ["DISPLAY"] = test_disp
                session["env"]["DISPLAY"] = test_disp
                with mss.mss(display=test_disp) as sct:
                    mon = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
                    sct_img = sct.grab(mon)
                    mss.tools.to_png(sct_img.rgb, sct_img.size, output=tmp_png)
                if os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 1000:
                    b64 = compress_and_b64(tmp_png)
                    if b64:
                        print(f"[CAPTURE] 🟢 Successfully captured via python-mss on display '{test_disp}'")
                        return b64
            except Exception as me:
                print(f"[CAPTURE-DEBUG] mss on {test_disp}: {me}")
    except ImportError:
        pass
    except Exception as e:
        print(f"[CAPTURE-DEBUG] mss overall: {e}")

    # Strategy 1: scrot CLI
    for test_disp in candidate_displays:
        try:
            cmd = ["scrot", "-z", "-q", "65", tmp_jpg]
            test_session = session.copy()
            test_session["env"] = session["env"].copy()
            test_session["env"]["DISPLAY"] = test_disp
            res = run_in_desktop_context(cmd, test_session, timeout=4)
            if not res or res.returncode != 0:
                res = subprocess.run(cmd, env=test_session["env"], capture_output=True, timeout=4)
            if res and res.returncode == 0 and os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 1000:
                b64 = compress_and_b64(tmp_jpg)
                if b64:
                    print(f"[CAPTURE] 🟢 Successfully captured via scrot on '{test_disp}'")
                    return b64
        except Exception as se:
            print(f"[CAPTURE-DEBUG] scrot on {test_disp}: {se}")

    # Strategy 2: ImageMagick import CLI
    for test_disp in candidate_displays:
        try:
            cmd = ["import", "-window", "root", "-display", test_disp, "-quality", "65", tmp_jpg]
            test_session = session.copy()
            test_session["env"] = session["env"].copy()
            test_session["env"]["DISPLAY"] = test_disp
            res = run_in_desktop_context(cmd, test_session, timeout=4)
            if not res or res.returncode != 0:
                res = subprocess.run(cmd, env=test_session["env"], capture_output=True, timeout=4)
            if res and res.returncode == 0 and os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 1000:
                b64 = compress_and_b64(tmp_jpg)
                if b64:
                    print(f"[CAPTURE] 🟢 Successfully captured via ImageMagick import on '{test_disp}'")
                    return b64
        except Exception as ie:
            print(f"[CAPTURE-DEBUG] import on {test_disp}: {ie}")

    # Strategy 3: grim CLI (Wayland)
    try:
        cmd = ["grim", tmp_png]
        res = run_in_desktop_context(cmd, session, timeout=4)
        if not res or res.returncode != 0:
            res = subprocess.run(cmd, env=session["env"], capture_output=True, timeout=4)
        if res and res.returncode == 0 and os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 1000:
            b64 = compress_and_b64(tmp_png)
            if b64:
                print(f"[CAPTURE] 🟢 Successfully captured via grim (Wayland)")
                return b64
    except Exception as ge:
        print(f"[CAPTURE-DEBUG] grim: {ge}")

    # Strategy 4: gnome-screenshot CLI
    try:
        cmd = ["gnome-screenshot", "-f", tmp_png]
        res = run_in_desktop_context(cmd, session, timeout=4)
        if not res or res.returncode != 0:
            res = subprocess.run(cmd, env=session["env"], capture_output=True, timeout=4)
        if res and res.returncode == 0 and os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 1000:
            b64 = compress_and_b64(tmp_png)
            if b64:
                print(f"[CAPTURE] 🟢 Successfully captured via gnome-screenshot")
                return b64
    except Exception as gse:
        print(f"[CAPTURE-DEBUG] gnome-screenshot: {gse}")

    # Strategy 5: GNOME Shell DBus via gdbus / dbus-send
    try:
        cmd = [
            "gdbus", "call", "--session",
            "--dest", "org.gnome.Shell.Screenshot",
            "--object-path", "/org/gnome/Shell/Screenshot",
            "--method", "org.gnome.Shell.Screenshot.Screenshot",
            "false", "false", f"'{tmp_png}'"
        ]
        res = run_in_desktop_context(cmd, session, timeout=4)
        if res and res.returncode == 0 and os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 1000:
            b64 = compress_and_b64(tmp_png)
            if b64:
                print(f"[CAPTURE] 🟢 Successfully captured via GNOME Shell DBus (gdbus) for user '{user}'")
                return b64
    except Exception as e:
        print(f"[CAPTURE-DEBUG] gdbus: {e}")

    try:
        cmd = [
            "dbus-send", "--session", "--type=method_call", "--print-reply",
            "--dest=org.gnome.Shell.Screenshot",
            "/org/gnome/Shell/Screenshot",
            "org.gnome.Shell.Screenshot.Screenshot",
            "boolean:false", "boolean:false", f"string:{tmp_png}"
        ]
        res = run_in_desktop_context(cmd, session, timeout=4)
        if res and res.returncode == 0 and os.path.exists(tmp_png) and os.path.getsize(tmp_png) > 1000:
            b64 = compress_and_b64(tmp_png)
            if b64:
                print(f"[CAPTURE] 🟢 Successfully captured via GNOME Shell DBus (dbus-send)")
                return b64
    except Exception as e:
        print(f"[CAPTURE-DEBUG] dbus-send: {e}")

    # Strategy 6: xwd + convert CLI
    for test_disp in candidate_displays:
        try:
            cmd = ["xwd", "-root", "-silent", "-display", test_disp, "-out", tmp_xwd]
            test_session = session.copy()
            test_session["env"] = session["env"].copy()
            test_session["env"]["DISPLAY"] = test_disp
            res = run_in_desktop_context(cmd, test_session, timeout=4)
            if not res or res.returncode != 0:
                res = subprocess.run(cmd, env=test_session["env"], capture_output=True, timeout=4)
            if res and res.returncode == 0 and os.path.exists(tmp_xwd) and os.path.getsize(tmp_xwd) > 1000:
                subprocess.run(["convert", tmp_xwd, tmp_jpg], timeout=3)
                try:
                    os.remove(tmp_xwd)
                except Exception:
                    pass
                if os.path.exists(tmp_jpg):
                    b64 = compress_and_b64(tmp_jpg)
                    if b64:
                        print(f"[CAPTURE] 🟢 Successfully captured via xwd on '{test_disp}'")
                        return b64
        except Exception:
            pass

    # Strategy 7: ffmpeg x11grab CLI
    for test_disp in candidate_displays:
        try:
            cmd = ["ffmpeg", "-f", "x11grab", "-i", test_disp, "-vframes", "1", "-q:v", "3", tmp_jpg, "-y"]
            test_session = session.copy()
            test_session["env"] = session["env"].copy()
            test_session["env"]["DISPLAY"] = test_disp
            res = run_in_desktop_context(cmd, test_session, timeout=4)
            if res and res.returncode == 0 and os.path.exists(tmp_jpg) and os.path.getsize(tmp_jpg) > 1000:
                b64 = compress_and_b64(tmp_jpg)
                if b64:
                    print(f"[CAPTURE] 🟢 Successfully captured via ffmpeg on '{test_disp}'")
                    return b64
        except Exception:
            pass

    # Strategy 8: PIL ImageGrab with explicit display
    try:
        from PIL import ImageGrab
        import io
        import base64
        for test_disp in candidate_displays:
            try:
                img = ImageGrab.grab(xdisplay=test_disp)
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=65)
                print(f"[CAPTURE] 🟢 Successfully captured via PIL ImageGrab on '{test_disp}'")
                return base64.b64encode(buf.getvalue()).decode("utf-8")
            except Exception as ige:
                print(f"[CAPTURE-DEBUG] ImageGrab on {test_disp}: {ige}")
    except Exception:
        pass

    return None


def execute_remote_command(cmd, pc_id, backend_url):
    """Executes on-demand remote commands dispatched by Lab Admin."""
    if not cmd:
        return
    cmd = cmd.strip()
    print(f"\n[REMOTE-COMMAND] Received: '{cmd}'")

    cmd_lower = cmd.lower()

    if cmd_lower in ("shutdown", "poweroff", "shutdown:force"):
        print(f"[SHUTDOWN] 🛑 Linux shutdown initiated on {pc_id} by AI Lab Administrator...")
        try:
            subprocess.Popen(["shutdown", "-h", "+0", "AI Lab Administrator: Remote shutdown"])
        except Exception:
            try:
                subprocess.Popen(["systemctl", "poweroff"])
            except Exception as se:
                print(f"[SHUTDOWN-ERR] {se}")

    elif cmd_lower in ("restart", "reboot", "restart:force"):
        print(f"[REBOOT] 🔄 Linux reboot initiated on {pc_id} by AI Lab Administrator...")
        try:
            subprocess.Popen(["shutdown", "-r", "+0", "AI Lab Administrator: Remote reboot"])
        except Exception:
            try:
                subprocess.Popen(["systemctl", "reboot"])
            except Exception as re:
                print(f"[REBOOT-ERR] {re}")

    elif cmd_lower in ("lock", "lockscreen"):
        print(f"[LOCK] 🔒 Locking Linux desktop session on {pc_id}...")
        try:
            subprocess.Popen(["loginctl", "lock-session"])
        except Exception:
            try:
                subprocess.Popen(["xdg-screensaver", "lock"])
            except Exception as le:
                print(f"[LOCK-ERR] {le}")

    elif cmd.startswith("warn:"):
        msg = cmd.split(":", 1)[1].strip()
        print(f"[WARN] ⚠️ Broadcast notice for {pc_id}: '{msg}'")
        try:
            # 1. Terminal broadcast (all open terminals & SSH sessions)
            subprocess.Popen(["wall", f"\n=======================================================\n  AI LAB ADMINISTRATOR NOTICE: {msg}\n=======================================================\n"])
        except Exception:
            pass

        try:
            # 2. Desktop notification + GUI modal popup in active user session
            session = get_desktop_session_info()
            
            # GNOME notification banner
            run_in_desktop_context(["notify-send", "-u", "critical", "-t", "25000", "⚠️ AI LAB ADMINISTRATOR NOTICE", msg], session)
            
            # Modal Dialog Box (zenity) - Pops up in center of screen with sound
            zenity_cmd = [
                "zenity", "--warning",
                "--title=AI LAB ADMINISTRATOR NOTICE",
                f"--text=⚠️ NOTICE FROM FACULTY / LAB ADMIN:\n\n{msg}",
                "--width=480"
            ]
            run_in_desktop_context(zenity_cmd, session)
        except Exception as we:
            print(f"[WARN-ERR] {we}")

    elif cmd.startswith("kill:"):
        target = cmd.split(":", 1)[1].strip()
        try:
            if target.isdigit():
                pid = int(target)
                os.kill(pid, signal.SIGTERM)
                print(f"[KILL] Terminated PID {pid}")
            else:
                subprocess.run(["pkill", "-f", target], timeout=3)
                print(f"[KILL] Terminated processes matching '{target}'")
        except Exception as e:
            print(f"[KILL-ERR] Failed to kill {target}: {e}")

    elif cmd == "capture_screen":
        try:
            print(f"[CAPTURE] 📸 On-demand desktop screen grab requested for {pc_id}...")
            img_b64 = capture_linux_screen(pc_id)

            if not img_b64:
                print(f"[CAPTURE-WARN] No graphical display detected. Generating system telemetry card.")
                from PIL import Image, ImageDraw
                img = Image.new("RGB", (700, 400), color=(15, 23, 42))
                draw = ImageDraw.Draw(img)
                draw.rectangle([(10, 10), (690, 390)], outline=(56, 189, 248), width=3)
                draw.text((30, 40), f"AI/ML LAB — {pc_id} (DGX NODE)", fill=(56, 189, 248))
                draw.text((30, 90), f"Status     : ACTIVE & ONLINE", fill=(34, 197, 94))
                draw.text((30, 130), f"Host System: {platform.system()} {platform.release()}", fill=(226, 232, 240))
                draw.text((30, 170), f"Timestamp  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", fill=(148, 163, 184))
                draw.text((30, 220), "CLI / SSH Active (No Display Server Attached)", fill=(251, 191, 36))
                import io
                import base64
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=60)
                img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            if img_b64:
                upload_url = f"{backend_url}/api/pc/screenshot"
                send_post(upload_url, {"pc_id": pc_id, "image_base64": img_b64}, timeout=6)
                print(f"[CAPTURE] 🚀 Live screen grab uploaded successfully to server for {pc_id}!")
        except Exception as e:
            print(f"[CAPTURE-ERR] {e}")

    elif cmd_lower in ("update", "upgrade", "update:force", "self_update"):
        perform_self_update(backend_url, pc_id)


def perform_self_update(backend_url: str, pc_id: str) -> bool:
    """
    Downloads latest dgx_telemetry_agent.py from central server,
    validates Python syntax, backs up old version, replaces script, and hot-restarts.
    Zero manual intervention required!
    """
    print(f"\n[AUTO-UPDATE] 🔄 Auto-update sequence triggered for {pc_id} from {backend_url}...")
    try:
        update_url = f"{backend_url}/dgx_agent/dgx_telemetry_agent.py"
        new_code = ""
        try:
            req = urllib.request.Request(
                update_url,
                headers={"User-Agent": f"DGX-Agent/{pc_id}-AutoUpdate"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                new_code = resp.read().decode("utf-8")
        except Exception as local_err:
            gh_url = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/dgx_telemetry_agent.py"
            req = urllib.request.Request(
                gh_url,
                headers={"User-Agent": f"DGX-Agent/{pc_id}-GitHubFallback"}
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                new_code = resp.read().decode("utf-8")

        # Sanity check: must be valid Python and have substantial content
        if len(new_code) < 1500 or "dgx_telemetry_agent.py" not in new_code:
            print(f"[AUTO-UPDATE-ERR] Downloaded payload invalid or incomplete ({len(new_code)} bytes). Aborting.")
            return False

        # Validate syntax before replacing
        compile(new_code, "<string>", "exec")

        current_script = os.path.abspath(__file__)
        backup_path = current_script + ".bak"

        # Safe backup
        try:
            with open(current_script, "r", encoding="utf-8") as cf:
                with open(backup_path, "w", encoding="utf-8") as bf:
                    bf.write(cf.read())
        except Exception:
            pass

        # Write new script atomically
        tmp_path = current_script + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as tf:
            tf.write(new_code)
        os.replace(tmp_path, current_script)

        print(f"[AUTO-UPDATE] ✅ Code updated successfully to latest server version!")
        print(f"[AUTO-UPDATE] 🚀 Hot-restarting process seamlessly...")
        time.sleep(1)

        if platform.system() == "Windows":
            dir_p = os.path.dirname(current_script)
            bat_p = os.path.join(dir_p, "_hot_restart.bat")
            with open(bat_p, "w", encoding="utf-8") as bf:
                bf.write(f'@echo off\ntimeout /t 2 /nobreak >nul\nstart "" "{sys.executable}" "{current_script}" {" ".join(sys.argv[1:])}\nexit\n')
            subprocess.Popen(["cmd.exe", "/c", bat_p], creationflags=0x08000000)
            sys.exit(0)
        else:
            # Native Linux / DGX hot restart
            os.execv(sys.executable, [sys.executable] + sys.argv)
        return True
    except Exception as e:
        print(f"[AUTO-UPDATE-ERR] Update failed: {e}")
        return False


def check_and_apply_auto_update(backend_url: str, pc_id: str):
    """Silent periodic check for updates against remote server / GitHub MD5 hash."""
    try:
        import hashlib
        remote_bytes = None
        try:
            req = urllib.request.Request(
                f"{backend_url}/dgx_agent/dgx_telemetry_agent.py",
                headers={"User-Agent": f"DGX-Agent/{pc_id}-HashCheck"}
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                remote_bytes = r.read()
        except Exception:
            gh_url = "https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/dgx_telemetry_agent.py"
            req = urllib.request.Request(
                gh_url,
                headers={"User-Agent": f"DGX-Agent/{pc_id}-GHHashCheck"}
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                remote_bytes = r.read()

        if remote_bytes:
            remote_md5 = hashlib.md5(remote_bytes).hexdigest()
            local_md5 = hashlib.md5(open(os.path.abspath(__file__), "rb").read()).hexdigest()
            if remote_md5 != local_md5:
                print(f"\n[AUTO-UPDATE] 🔔 New server version detected (MD5 mismatch). Updating silently...")
                perform_self_update(backend_url, pc_id)
    except Exception:
        pass


def resolve_pc_id(arg_id=None):
    """Determines PC ID from CLI argument, environment variable, or hostname."""
    raw = (arg_id or "").strip()
    if not raw:
        raw = os.environ.get("AI_LAB_PC_ID", "").strip()
    if not raw:
        raw = socket.gethostname()

    raw_clean = raw.upper()

    # If user passed just a single digit like '5' -> 'PC-5'
    if raw_clean.isdigit():
        return f"PC-{int(raw_clean)}"

    # If 'DGX-5' or 'DGX5' or 'PC5' -> 'PC-5'
    import re
    m = re.match(r'^(?:PC|DGX)[-_]?([0-9]+)$', raw_clean)
    if m:
        return f"PC-{m.group(1)}"

    for i in range(1, 9):
        if f"PC-{i}" in raw_clean or f"PC{i}" in raw_clean or f"DGX-{i}" in raw_clean or f"DGX{i}" in raw_clean:
            return f"PC-{i}"

    return raw_clean


def main():
    ensure_healthy_dns()

    parser = argparse.ArgumentParser(description="AI/ML LAB Workstation & DGX Telemetry Daemon")
    parser.add_argument("--pc-id", "-i", default="", help="PC Identifier (e.g. PC-1, PC-2, DGX-1)")
    parser.add_argument("--url", "-u", default=DEFAULT_BACKEND_URL, help="Backend Server URL")
    parser.add_argument("--fallback-url", "-f", default=FALLBACK_BACKEND_URL, help="Fallback Backend URL (LAN/Direct)")
    parser.add_argument("--interval", "-t", type=int, default=DEFAULT_INTERVAL, help="Heartbeat interval in seconds")
    args = parser.parse_args()

    pc_id = resolve_pc_id(args.pc_id)
    primary_url = args.url.rstrip("/")
    fallback_url = args.fallback_url.rstrip("/") if args.fallback_url else ""
    active_url = primary_url
    interval = max(3, args.interval)

    print("=" * 68)
    print(f"🚀 AI/ML LAB DGX & WORKSTATION TELEMETRY AGENT v2.2 (Multi-Path)")
    print(f"🖥️ Target PC ID   : {pc_id}")
    print(f"🌐 Primary URL    : {primary_url}")
    print(f"🔗 Fallback URL   : {fallback_url or 'None'}")
    print(f"⏱️ Interval       : {interval} seconds")
    print(f"💻 System         : {platform.system()} {platform.release()} ({platform.machine()})")
    print("=" * 68)

    def on_exit():
        print(f"\n[OFFLINE] Sending shutdown broadcast for {pc_id}...")
        for u in [active_url, fallback_url]:
            if u:
                if send_post(f"{u}/api/pc/offline", {"pc_id": pc_id}, timeout=3):
                    break
        print("[OFFLINE] Notification delivered. Goodbye.")

    atexit.register(on_exit)
    signal.signal(signal.SIGTERM, lambda s, f: sys.exit(0))
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))

    last_update_check = time.time()
    UPDATE_CHECK_INTERVAL = 900  # 15 minutes

    while True:
        try:
            cpu_pct, btime = get_cpu_and_uptime()
            ram_pct, ram_used, ram_total = get_memory_info()
            gpu_stats = get_nvidia_dgx_gpu_info()
            ip_addr = get_local_ip()
            top_procs = get_linux_top_processes()
            user_str, active_win = get_linux_active_info()

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
                "boot_time": btime,
                "active_window": active_win,
                "top_processes": top_procs,
                "logged_user": user_str
            }

            heartbeat_url = f"{active_url}/api/pc/heartbeat"
            success, resp_data = send_post_json(heartbeat_url, payload, timeout=5)

            # Auto-failover to LAN / alternate backend if primary fails
            if not success and fallback_url and active_url != fallback_url:
                alt_heartbeat_url = f"{fallback_url}/api/pc/heartbeat"
                success, resp_data = send_post_json(alt_heartbeat_url, payload, timeout=5)
                if success:
                    t_switch = datetime.now().strftime("%H:%M:%S")
                    print(f"[{t_switch}] 🔄 Primary unreachable ({active_url}). Switched dynamically to Fallback URL ({fallback_url})!")
                    active_url, fallback_url = fallback_url, active_url

            t_now = datetime.now().strftime("%H:%M:%S")

            if success:
                gpu_tag = f" | GPU: {gpu_stats['gpu_percent']}% ({gpu_stats['gpu_name']})" if gpu_stats['gpu_name'] else ""
                print(f"[{t_now}] 🟢 [{pc_id}] OK | User: {user_str} | CPU: {cpu_pct}% | RAM: {ram_pct}% ({ram_used}/{ram_total} GB){gpu_tag}")

                cmd = resp_data.get("command") if isinstance(resp_data, dict) else None
                if cmd:
                    execute_remote_command(cmd, pc_id, active_url)
            else:
                print(f"[{t_now}] ⚠️ [{pc_id}] Backend unreachable (Tried: {active_url}{' & ' + fallback_url if fallback_url else ''}). Retrying in {interval}s...")

        except Exception as e:
            print(f"[ERR] Telemetry loop exception: {e}")

        time.sleep(interval)

        # Periodic silent background update check (every 15 min)
        try:
            if time.time() - last_update_check > UPDATE_CHECK_INTERVAL:
                last_update_check = time.time()
                check_and_apply_auto_update(active_url, pc_id)
        except Exception:
            pass


if __name__ == "__main__":
    main()
