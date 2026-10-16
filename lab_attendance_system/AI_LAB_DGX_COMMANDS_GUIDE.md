# 🚀 AI LAB & DGX SYSTEM COMMANDS GUIDE
### PIET AI & Deep Learning Department • Standalone System Documentation
> **Boundary Note:** This documentation belongs **strictly to the AI Lab** (Facial Attendance + Workstations PC-1 to PC-8 + DGX Station).  
> It is **completely isolated** from the PIET 5-Lab System (`piet_system/`). Do not mix configs or endpoints!

---

## 🏛️ System Overview & Network Topology

* **Central Backend Server:** Server Room Master PC (`LABG418PC12`)
* **Local Backend Port:** `http://127.0.0.1:8000` (FastAPI + SQLite)
* **Secure Tailscale Funnel:** `https://labg418pc12.tailc8c1f6.ts.net`
* **Supervised Endpoints:**
  * **DGX Station:** NVIDIA A100 / GPU Linux Server (`DGX-1` or `DGX-SERVER`)
  * **Workstations:** AI Lab Windows PCs (`PC-1` through `PC-8`)
  * **Web Portals:** MAMS Attendance Portal (`/mams_portal`) & Display Dashboard (`/display_portal`)

---

## 🖥️ Section 1: NVIDIA DGX Station Commands (Linux / Ubuntu)

The DGX Agent tracks Multi-GPU utilization, VRAM usage, temperature, CPU/RAM load, and captures live desktop sessions.

### 1. 1-Click Auto-Install as Permanent Service (Recommended)
Run this single command on the DGX Station terminal (as root or with `sudo`):

```bash
curl -sSL https://labg418pc12.tailc8c1f6.ts.net/dgx_agent/install_dgx_service.sh | sudo bash -s DGX-1
```
*(Replace `DGX-1` with your preferred identifier if needed, e.g., `DGX-STATION` or `PC-6`)*

* **GitHub Raw Fallback:**
  ```bash
  curl -sSL https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/install_dgx_service.sh | sudo bash -s DGX-1 https://labg418pc12.tailc8c1f6.ts.net
  ```

---

### 2. Live Console Test Mode (Interactive Terminal)
To verify heartbeats and GPU stats in real-time before installing the service:

```bash
mkdir -p ~/dgx_agent && cd ~/dgx_agent
curl -sSL https://labg418pc12.tailc8c1f6.ts.net/dgx_agent/dgx_telemetry_agent.py -o dgx_telemetry_agent.py
python3 dgx_telemetry_agent.py --pc-id DGX-1 --url https://labg418pc12.tailc8c1f6.ts.net
```

**Expected Terminal Output:**
```text
=================================================================
🚀 AI LAB DGX TELEMETRY & SCREEN SUPERVISION AGENT
🖥️ PC ID        : DGX-1
🌐 Backend URL  : https://labg418pc12.tailc8c1f6.ts.net
⏱️ Heartbeat    : Every 4s
🎮 GPU Metrics  : Active (nvidia-smi Multi-GPU Tracker)
=================================================================
[12:30:00] 🟢 [DGX-1] OK | GPU: NVIDIA A100 | VRAM: 18.2/80GB | CPU: 12% | RAM: 24%
```

---

### 3. Service Management (Systemd)
After running the 1-click installer, manage the service using standard systemctl commands:

```bash
# Check service status (Online/Offline)
sudo systemctl status ailab-telemetry.service

# Restart service (e.g. after network change)
sudo systemctl restart ailab-telemetry.service

# Stop service
sudo systemctl stop ailab-telemetry.service

# View live streaming logs
sudo journalctl -u ailab-telemetry.service -f
```

---

## 💻 Section 2: AI Lab Windows Workstations (PC-1 to PC-8)

Client workstations report active window title, keyboard/mouse idle time, CPU/RAM metrics, and accept remote alerts/power actions.

### 1. 1-Click Permanent Background Setup (PowerShell)
On any lab PC (PC-1 through PC-8), open PowerShell and run:

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://labg418pc12.tailc8c1f6.ts.net/client_agent/install_startup.bat -OutFile install.bat; .\install.bat 1"
```
*(Change `1` to the respective PC number: `2`, `3`, ..., `8`)*

---

### 2. Live Console Test Mode (Windows)
To test and view live heartbeats on the screen:

```powershell
cd c:\Users\serverroom\AI-LAB\lab_attendance_system\client_agent
python pc_telemetry_agent.py 1
```

---

## 🎛️ Section 3: Central Backend & Tailscale Funnel (Server Room Master PC)

### 1. Start AI Lab 24/7 Watchdog Server
Double-click `run_24_7.bat` or run in terminal:

```powershell
cd c:\Users\serverroom\AI-LAB\lab_attendance_system
.\run_24_7.bat
```

### 2. Verify Tailscale Funnel Status
```powershell
tailscale status
tailscale serve status
```
*Expected: `https://labg418pc12.tailc8c1f6.ts.net` proxying to `http://127.0.0.1:8000`*

### 3. Verify Health & Connected Workstations
In browser or curl:
* **Health Check:** `https://labg418pc12.tailc8c1f6.ts.net/health`
* **Live Telemetry Grid:** `https://labg418pc12.tailc8c1f6.ts.net/api/pc/status`
* **Download All Screenshots (ZIP):** `https://labg418pc12.tailc8c1f6.ts.net/api/pc/download_all_screenshots`

---

## ⚠️ Section 4: Remote Command Execution & Alert Protocol

Commands can be triggered directly from the MAMS / Teacher supervision dashboard:

1. **⚠️ Send Alert (`warn:<message>`):**  
   Pops up an unmissable, on-top modern Dark Glass HUD with audio chime on the target workstation:  
   **Designation:** `Dr. Richa Choudhary, Assistant Professor`
2. **📸 On-Demand Screenshot (`capture_screen`):**  
   Instantly captures high-resolution desktop and uploads it to the backend SSD.
3. **🔒 Lock Screen (`lock`):**  
   Locks Windows or Linux session immediately.
4. **🛑 Turn Off PC (`shutdown`):**  
   Graceful 5-second countdown shutdown.
5. **🔄 Reboot Workstation (`restart`):**  
   Reboots the system cleanly.
