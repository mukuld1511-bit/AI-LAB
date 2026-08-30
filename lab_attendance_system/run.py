import subprocess
import os
import sys
import time

def main():
    print("=" * 65)
    print("    🚀 STARTING UNIFIED AI/ML LAB ATTENDANCE SYSTEM 🚀")
    print("=" * 65)

    root_dir = os.path.dirname(os.path.abspath(__file__))
    backend_main = os.path.join(root_dir, "backend", "main.py")

    # Start FastAPI Backend
    print("[INFO] Starting Unified Backend (FastAPI + Camera Stream)...")
    backend_process = subprocess.Popen([sys.executable, backend_main], cwd=root_dir)

    print("\n[INFO] Backend starting! Give it a few seconds to load the camera model...")
    time.sleep(5)
    
    # Start Ngrok Tunnel (if the script exists)
    tunnel_script = os.path.join(root_dir, "auto_tunnel.py")
    if os.path.exists(tunnel_script):
        print("\n[INFO] Starting Ngrok Tunnel...")
        subprocess.Popen([sys.executable, tunnel_script], cwd=root_dir)
    else:
        print("\n[WARNING] auto_tunnel.py not found. You can only access via localhost:8000")

    print("\n" + "=" * 65)
    print("✅ SYSTEM RUNNING!")
    print("➡️ OPEN DASHBOARD AT: http://localhost:8000")
    print("=" * 65 + "\n")

    try:
        # Keep the main process alive
        backend_process.wait()
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down system...")
        backend_process.terminate()
        sys.exit(0)

if __name__ == "__main__":
    main()
