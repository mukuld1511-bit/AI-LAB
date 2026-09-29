"""
auto_tunnel.py — Production 24/7 ngrok Tunnel Manager with Permanent Static Domain

Features:
1. Reads NGROK_DOMAIN and NGROK_AUTHTOKEN from .env or system environment.
2. Binds directly to permanent static domain (amaretto-confess-subtract.ngrok-free.dev).
3. Safely cleans up orphaned ngrok processes to avoid ERR_NGROK_334 conflicts.
4. Keeps the tunnel running continuously without unnecessary restart loops.
5. Updates tunnel_url.txt and copies public URL to Windows clipboard.
"""
import subprocess
import time
import sys
import json
import os
import shutil

try:
    sys.stdout.reconfigure(line_buffering=True)
    sys.stderr.reconfigure(line_buffering=True)
except Exception:
    pass

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(CURRENT_DIR, ".env")
TUNNEL_FILE = os.path.join(CURRENT_DIR, "tunnel_url.txt")


def load_env_vars():
    """Simple robust .env parser without requiring external libraries."""
    env_vars = {}
    if os.path.exists(ENV_FILE):
        try:
            with open(ENV_FILE, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    env_vars[key.strip()] = val.strip().strip('"').strip("'")
        except Exception as e:
            print(f"[WARN] Could not parse .env file: {e}")
    return env_vars


ENV_CONFIG = load_env_vars()
NGROK_PORT = int(os.environ.get("NGROK_PORT", ENV_CONFIG.get("NGROK_PORT", 8000)))
NGROK_DOMAIN = os.environ.get("NGROK_DOMAIN", ENV_CONFIG.get("NGROK_DOMAIN", "amaretto-confess-subtract.ngrok-free.dev"))
NGROK_AUTHTOKEN = os.environ.get("NGROK_AUTHTOKEN", ENV_CONFIG.get("NGROK_AUTHTOKEN", "")).strip()
NGROK_BIN = shutil.which("ngrok") or shutil.which("ngrok.exe") or "ngrok"


def kill_existing_ngrok():
    """Kills any orphaned ngrok.exe processes to free port and domain locks."""
    try:
        res = subprocess.run(["taskkill", "/F", "/IM", "ngrok.exe"], capture_output=True, text=True, check=False)
        if "SUCCESS" in (res.stdout or ""):
            print("[INFO] Cleaned up previous orphaned ngrok process.")
            time.sleep(2)
    except Exception:
        pass


def check_and_apply_authtoken():
    """If NGROK_AUTHTOKEN is present in .env, configure ngrok with it."""
    if NGROK_AUTHTOKEN:
        print("[INFO] Applying ngrok authtoken from configuration...")
        try:
            res = subprocess.run(
                [NGROK_BIN, "config", "add-authtoken", NGROK_AUTHTOKEN],
                capture_output=True,
                text=True,
                check=False
            )
            if res.returncode == 0:
                print("[SUCCESS] ngrok authtoken saved successfully.")
            else:
                print(f"[WARN] ngrok config returned: {res.stderr.strip() or res.stdout.strip()}")
        except Exception as e:
            print(f"[WARN] Error running 'ngrok config add-authtoken': {e}")


def get_ngrok_url():
    """Read the public URL from ngrok's local API (localhost:4040)."""
    import urllib.request
    try:
        req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels", headers={"User-Agent": "AILabTunnelWatcher/2.1"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tunnels = data.get("tunnels", [])
            for t in tunnels:
                if t.get("proto") == "https":
                    return t.get("public_url")
            if tunnels:
                return tunnels[0].get("public_url")
    except Exception:
        return None
    return None


def copy_to_clipboard(text: str) -> bool:
    """Copy text to Windows clipboard."""
    try:
        subprocess.run(["clip"], input=text.encode(), check=True)
        return True
    except Exception:
        return False


def start_tunnel_process():
    """Spawns ngrok with permanent static domain flag."""
    cmd = [NGROK_BIN, "http", str(NGROK_PORT)]
    if NGROK_DOMAIN:
        cmd.extend(["--domain", NGROK_DOMAIN])

    print(f"[INFO] Spawning tunnel process: {' '.join(cmd)}")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )
    return proc


def run_cloudflared_tunnel():
    """Runs Cloudflare Quick Tunnel with completely unlimited free bandwidth (bypasses ngrok quota)."""
    cloudflared_exe = os.path.join(CURRENT_DIR, "cloudflared.exe")
    if not os.path.exists(cloudflared_exe):
        cloudflared_exe = "cloudflared"

    cmd = [cloudflared_exe, "tunnel", "--url", f"http://localhost:{NGROK_PORT}"]
    print("\n" + "=" * 65)
    print("   AI/ML LAB UNLIMITED CLOUDFLARE TUNNEL (NO BANDWIDTH CAP)")
    print(f"   Target Port  : {NGROK_PORT}")
    print(f"   Executable   : {cloudflared_exe}")
    print("=" * 65)
    print(f"[INFO] Spawning Cloudflare process: {' '.join(cmd)}")

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
    except Exception as e:
        print(f"[ERROR] Could not start cloudflared: {e}")
        return False

    url = None
    import re
    while True:
        line = proc.stdout.readline()
        if not line and proc.poll() is not None:
            break
        line_str = line.strip()
        if "trycloudflare.com" in line_str:
            m = re.search(r'https://[a-zA-Z0-9-]+\.trycloudflare\.com', line_str)
            if m:
                url = m.group(0)
                print("\n" + "=" * 65)
                print("  [SUCCESS] 24/7 CLOUDFLARE UNLIMITED TUNNEL ONLINE!")
                print(f"  >> Public Cloud URL: {url}")
                print(f"  >> Faculty Portal  : {url}/mams_portal/index.html")
                print("  >> Completely UNLIMITED Bandwidth (Zero Monthly Caps)")
                print("=" * 65 + "\n")
                try:
                    with open(TUNNEL_FILE, "w", encoding="utf-8") as f:
                        f.write(url.strip())
                    print(f"[INFO] Saved active URL to {TUNNEL_FILE}")
                except Exception as e:
                    print(f"[WARN] Could not write {TUNNEL_FILE}: {e}")
                copy_to_clipboard(url)

    proc.wait()
    return True


def run_tunnel():
    tunnel_provider = ENV_CONFIG.get("TUNNEL_PROVIDER", "auto").lower()

    # If provider is explicitly set to cloudflared, run it directly
    if tunnel_provider == "cloudflared":
        print("[INFO] TUNNEL_PROVIDER set to cloudflared. Running Cloudflare Unlimited Tunnel...")
        run_cloudflared_tunnel()
        return

    print("=" * 65)
    print("   AI/ML LAB 24/7 PERMANENT TUNNEL MANAGER")
    print(f"   Target Port  : {NGROK_PORT}")
    print(f"   Target Domain: {NGROK_DOMAIN or '(Random Ephemeral)'}")
    print("=" * 65)

    # 1. Clean up any lingering ngrok instance
    kill_existing_ngrok()

    # 2. Verify ngrok CLI availability
    try:
        res = subprocess.run([NGROK_BIN, "version"], capture_output=True, text=True, check=True)
        print(f"[INFO] Detected: {res.stdout.strip()}")
    except (FileNotFoundError, subprocess.CalledProcessError):
        print("[WARN] ngrok is not installed or not in PATH! Switching to Cloudflare Tunnel...")
        run_cloudflared_tunnel()
        return

    # 3. Configure authtoken if specified
    check_and_apply_authtoken()

    # 4. Continuous tunnel runner with automatic failover to Cloudflare on bandwidth limit
    ngrok_quota_exceeded = False
    conflict_count = 0

    while True:
        if ngrok_quota_exceeded or conflict_count >= 3:
            if conflict_count >= 3:
                print("\n[WARN] ngrok domain endpoint conflict persisted (ERR_NGROK_334). Switching to Cloudflare Unlimited Tunnel...")
            else:
                print("\n[WARN] ngrok monthly bandwidth quota is exceeded. Running on Cloudflare Unlimited Tunnel...")
            run_cloudflared_tunnel()
            time.sleep(5)
            conflict_count = 0
            continue

        try:
            proc = start_tunnel_process()
            print("[INFO] Establishing permanent cloud tunnel connection...")

            url = None
            for attempt in range(1, 15):
                time.sleep(1)
                # Check if process exited early
                if proc.poll() is not None:
                    err_out = proc.stderr.read() if proc.stderr else "Process exited"
                    print(f"[WARN] ngrok exited early: {err_out.strip()}")
                    if "ERR_NGROK_725" in err_out or "bandwidth exceeded" in err_out.lower():
                        print("[ALERT] ngrok Account Bandwidth Exceeded (ERR_NGROK_725)!")
                        print("[INFO] Automatically switching to Cloudflare Tunnel (unlimited bandwidth)...")
                        ngrok_quota_exceeded = True
                        break
                    if "ERR_NGROK_334" in err_out:
                        conflict_count += 1
                        print(f"[INFO] Endpoint conflict detected ({conflict_count}/3). Clearing previous session...")
                        kill_existing_ngrok()
                        time.sleep(3)
                    break

                url = get_ngrok_url()
                if url:
                    break
                print(f"       Attempt {attempt}/15 verifying tunnel status...")

            if url and not ngrok_quota_exceeded:
                print("\n" + "=" * 65)
                print("  [SUCCESS] 24/7 PERMANENT TUNNEL ONLINE!")
                print(f"  >> Public Cloud URL: {url}")
                print(f"  >> Faculty Portal  : {url}/mams_portal/index.html")
                print("  >> Ready for Vercel Frontend Connection!")
                print("=" * 65 + "\n")

                try:
                    with open(TUNNEL_FILE, "w", encoding="utf-8") as f:
                        f.write(url.strip())
                    print(f"[INFO] Saved active URL to {TUNNEL_FILE}")
                except Exception as e:
                    print(f"[WARN] Could not write {TUNNEL_FILE}: {e}")

                if copy_to_clipboard(url):
                    print("[INFO] Copied permanent URL to clipboard.")

                # Keep ngrok alive continuously as long as the process is healthy
                proc.wait()
                print(f"[WARN] ngrok process terminated with exit code {proc.returncode}.")
            else:
                if not ngrok_quota_exceeded:
                    print("[WARN] Could not retrieve tunnel URL. Retrying in 5s...")
                if proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except Exception:
                        proc.kill()

        except KeyboardInterrupt:
            print("\n[INFO] Manual interrupt received. Stopping tunnel...")
            try:
                proc.terminate()
            except Exception:
                pass
            print("[DONE] Tunnel stopped.")
            break
        except Exception as e:
            print(f"[ERROR] Tunnel exception: {e}")

        print("[INFO] Waiting 5 seconds before reconnecting...")
        kill_existing_ngrok()
        time.sleep(5)


if __name__ == "__main__":
    run_tunnel()
