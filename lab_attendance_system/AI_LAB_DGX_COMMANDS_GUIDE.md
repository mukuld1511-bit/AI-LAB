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

## 🖥️ Section 1: AI Lab 8 DGX Machines (Linux / GPU Stations PC-1 to PC-8)

AI Lab me **sirf 8 DGX machines** hain (`PC-1` se `PC-8`). 
Inhe setup karne ke liye har DGX par sirf **EK BAAR** ye command chalani hai. Uske baad ye boot par apne aap start hoga aur auto-update rahega!

### 🌟 Universal 1-Time Setup Command (Permanent Auto-Start + Auto-Update)
Jis bhi DGX par aap khade hain, bas aakhri me uska number daal kar run karein (jaise `5` ya `1` se `8`):

```bash
curl -sSL https://labg418pc12.tailc8c1f6.ts.net/dgx_agent/setup.sh | sudo bash -s 5
```
*(GitHub Raw Backup: `curl -sSL https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/lab_attendance_system/dgx_agent/setup.sh | sudo bash -s 5`)*

> **Note:** Agar aap number pass nahi karenge, to script aapse poochhegi: `Enter DGX Station / PC Number in AI Lab (1 to 8):`

**Is command se kya hota hai:**
1. Ye system packages (`scrot`, `imagemagick`, `mss`, `psutil`) auto-install karta hai.
2. Latest `dgx_telemetry_agent.py` `/opt/ai_lab_agent` me setup karta hai.
3. Permanent Linux Systemd Service (`ailab-telemetry.service`) banakar **Enable** kar deta hai (`Restart=always`).
4. **Auto-Update Active:** Har 15 minute me silent background hash check karta hai aur Central Dashboard ke 1-Click Update command se instantly update ho jata hai.
5. **Iske baad is DGX par kabhi dobara command nahi chalani padegi!**

---

### 💻 Manual Console Mode (Sirf Live Screen Testing ke liye)
Agar kabhi debugging ke liye terminal me bina service ke chalana ho:

```bash
curl -sSL https://labg418pc12.tailc8c1f6.ts.net/dgx_agent/dgx_telemetry_agent.py -o dgx_telemetry_agent.py && python3 dgx_telemetry_agent.py --pc-id 5
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
6. **⚡ Zero-Touch Auto-Update (`update` / `/api/pc/update_all`):**  
   **No need to physically visit PCs!**  
   Dispatches remote update to all active lab workstations (PC-1 to PC-8 & DGX). Each agent fetches the newest code from the server SSD, verifies it, and hot-reloads itself within 5 seconds.  
   *(Trigger via MAMS Dashboard: **`🛑 Lab Power`** ➔ **`⚡ Auto-Update All Agents`** or via API `curl -X POST https://labg418pc12.tailc8c1f6.ts.net/api/pc/update_all`).*  
   *Additionally, every running agent silently checks for code updates every 15 minutes automatically!*
