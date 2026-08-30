"""
auto_tunnel.py — Starts ngrok and auto-publishes the tunnel URL.

This script:
1. Starts ngrok as a subprocess
2. Reads the public URL from ngrok's local API (localhost:4040)
3. Copies the URL to clipboard
4. Writes it to tunnel_url.txt (for reference)
5. Keeps running (ngrok stays alive)

Usage: python auto_tunnel.py
"""
import subprocess
import time
import sys
import json
import os

NGROK_PORT = 8000
TUNNEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tunnel_url.txt")


def get_ngrok_url():
    """Read the public URL from ngrok's local API."""
    import requests
    try:
        resp = requests.get("http://127.0.0.1:4040/api/tunnels", timeout=3)
        data = resp.json()
        tunnels = data.get("tunnels", [])
        for t in tunnels:
            if t.get("proto") == "https":
                return t["public_url"]
        # fallback to first tunnel
        if tunnels:
            return tunnels[0]["public_url"]
    except Exception:
        return None
    return None


def copy_to_clipboard(text):
    """Copy text to Windows clipboard."""
    try:
        subprocess.run(["clip"], input=text.encode(), check=True)
        return True
    except Exception:
        return False


def main():
    print("=" * 60)
    print("  ngrok Auto-Tunnel Manager")
    print("=" * 60)
    print()

    # Check if ngrok is available
    try:
        subprocess.run(["ngrok", "version"], capture_output=True, check=True)
    except FileNotFoundError:
        print("[ERROR] ngrok is not installed or not in PATH!")
        print("        Download from: https://ngrok.com/download")
        print("        After installing, run: ngrok config add-authtoken YOUR_TOKEN")
        sys.exit(1)

    # Start ngrok
    print(f"[INFO] Starting ngrok tunnel on port {NGROK_PORT}...")
    ngrok_proc = subprocess.Popen(
        ["ngrok", "http", str(NGROK_PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Wait for ngrok to initialize
    print("[INFO] Waiting for tunnel to establish...")
    url = None
    for attempt in range(15):
        time.sleep(1)
        url = get_ngrok_url()
        if url:
            break
        print(f"       Attempt {attempt + 1}/15...")

    if not url:
        print("[ERROR] Could not get ngrok tunnel URL after 15 seconds.")
        print("        Check ngrok status at http://localhost:4040")
        ngrok_proc.terminate()
        sys.exit(1)

    # Success!
    print()
    print("=" * 60)
    print(f"  ✅ TUNNEL ACTIVE!")
    print(f"  🔗 Public URL: {url}")
    print("=" * 60)
    print()

    # Save to file
    with open(TUNNEL_FILE, "w") as f:
        f.write(url)
    print(f"[INFO] URL saved to: {TUNNEL_FILE}")

    # Copy to clipboard
    if copy_to_clipboard(url):
        print("[INFO] URL copied to clipboard! Just Ctrl+V to paste.")
    else:
        print("[INFO] Could not copy to clipboard. Copy the URL manually.")

    print()
    print("[INFO] Paste this URL in the Vercel dashboard ⚙️ Settings.")
    print("[INFO] ngrok is running. Press Ctrl+C to stop.")
    print()

    # Keep alive
    try:
        ngrok_proc.wait()
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down ngrok tunnel...")
        ngrok_proc.terminate()
        print("[DONE] Tunnel closed.")


if __name__ == "__main__":
    main()
