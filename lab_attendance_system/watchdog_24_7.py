"""
watchdog_24_7.py — High-Availability 24/7 Process Supervisor for AI/ML Lab PC

Designed for continuous 24/7 autonomous operation in the laboratory:
1. Spawns and manages both FastAPI Backend and ngrok Permanent Tunnel.
2. If either process dies, crashes, or drops connection, restarts it automatically.
3. Performs active HTTP health checks on http://127.0.0.1:8000/health every 30s.
4. Manages rotating logs in logs/ (backend.log, ngrok.log, watchdog.log).
5. Supports clean shutdown on SIGINT/Ctrl+C.
"""
import subprocess
import time
import sys
import os
import signal
import urllib.request
import json
from datetime import datetime

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LOGS_DIR = os.path.join(CURRENT_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

WATCHDOG_LOG = os.path.join(LOGS_DIR, "watchdog.log")
BACKEND_LOG = os.path.join(LOGS_DIR, "backend.log")
NGROK_LOG = os.path.join(LOGS_DIR, "ngrok.log")


def log_watchdog(message: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] [WATCHDOG] {message}"
    print(formatted)
    try:
        with open(WATCHDOG_LOG, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


def get_python_exe():
    """Detects virtualenv python or falls back to sys.executable."""
    venv_python = os.path.join(CURRENT_DIR, "venv", "Scripts", "python.exe")
    if os.path.exists(venv_python):
        return venv_python
    return sys.executable


def start_backend(python_exe):
    backend_script = os.path.join(CURRENT_DIR, "backend", "main.py")
    log_watchdog(f"Starting Backend via {python_exe}...")
    log_file = open(BACKEND_LOG, "a", encoding="utf-8")
    proc = subprocess.Popen(
        [python_exe, backend_script],
        cwd=CURRENT_DIR,
        stdout=log_file,
        stderr=subprocess.STDOUT
    )
    return proc, log_file


def start_tunnel(python_exe):
    tunnel_script = os.path.join(CURRENT_DIR, "auto_tunnel.py")
    log_watchdog(f"Starting Permanent ngrok Tunnel via {python_exe}...")
    log_file = open(NGROK_LOG, "a", encoding="utf-8")
    proc = subprocess.Popen(
        [python_exe, tunnel_script],
        cwd=CURRENT_DIR,
        stdout=log_file,
        stderr=subprocess.STDOUT
    )
    return proc, log_file


def ping_health():
    """Returns True if FastAPI /health endpoint responds 200 OK."""
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/health", headers={"User-Agent": "AILabWatchdog/2.1"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("status") == "ok"
    except Exception:
        return False
    return False


def main():
    log_watchdog("=" * 65)
    log_watchdog("AI/ML LAB 24/7 PRODUCTION SUPERVISOR INITIALIZING")
    log_watchdog("=" * 65)

    python_exe = get_python_exe()
    log_watchdog(f"Target Python runtime: {python_exe}")

    backend_proc, backend_log = start_backend(python_exe)
    # Give backend 4 seconds to spin up camera and models
    time.sleep(4)
    tunnel_proc, tunnel_log = start_tunnel(python_exe)

    health_fail_count = 0
    running = True

    def signal_handler(sig, frame):
        nonlocal running
        log_watchdog("Termination signal received. Shutting down all subservices...")
        running = False

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        while running:
            time.sleep(10)

            # 1. Check Backend Process
            if backend_proc.poll() is not None:
                exit_code = backend_proc.returncode
                log_watchdog(f"WARNING: Backend process exited (code {exit_code}). Auto-restarting...")
                try:
                    backend_log.close()
                except Exception:
                    pass
                backend_proc, backend_log = start_backend(python_exe)
                health_fail_count = 0

            # 2. Check Tunnel Process
            if tunnel_proc.poll() is not None:
                exit_code = tunnel_proc.returncode
                log_watchdog(f"WARNING: ngrok Tunnel process exited (code {exit_code}). Auto-restarting...")
                try:
                    tunnel_log.close()
                except Exception:
                    pass
                tunnel_proc, tunnel_log = start_tunnel(python_exe)

            # 3. Active HTTP Health Check every 30s
            is_healthy = ping_health()
            if not is_healthy:
                health_fail_count += 1
                log_watchdog(f"Health check failed (attempt {health_fail_count}/4)...")
                if health_fail_count >= 4:
                    log_watchdog("Backend unresponsive for 40s. Recycling backend process...")
                    try:
                        backend_proc.terminate()
                        backend_proc.wait(timeout=5)
                    except Exception:
                        backend_proc.kill()
                    try:
                        backend_log.close()
                    except Exception:
                        pass
                    backend_proc, backend_log = start_backend(python_exe)
                    health_fail_count = 0
            else:
                if health_fail_count > 0:
                    log_watchdog("Backend health restored successfully.")
                health_fail_count = 0

    except Exception as e:
        log_watchdog(f"Unexpected supervisor loop error: {e}")
    finally:
        log_watchdog("Cleaning up child processes...")
        for p in [backend_proc, tunnel_proc]:
            if p and p.poll() is None:
                try:
                    p.terminate()
                    p.wait(timeout=3)
                except Exception:
                    try:
                        p.kill()
                    except Exception:
                        pass
        try:
            backend_log.close()
            tunnel_log.close()
        except Exception:
            pass
        log_watchdog("Supervisor stopped cleanly.")


if __name__ == "__main__":
    main()
