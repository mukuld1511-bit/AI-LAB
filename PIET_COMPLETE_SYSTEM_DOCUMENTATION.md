# PIET AIML DEPARTMENT — SMART LAB SUPERVISION & ATTENDANCE SYSTEM
## Master Technical Architecture, Operational Runbook & Complete Context Guide

**Version:** 3.5.0 (Production Multi-Tier Lab Deployment)  
**Department:** Department of Artificial Intelligence & Machine Learning, Panipat Institute of Engineering & Technology (PIET)  
**In-Charge:** Prof. Dr. Richa Choudhary  
**Date of Snapshot:** October 14, 2026  
**Repository:** [https://github.com/mukuld1511-bit/AI-LAB.git](https://github.com/mukuld1511-bit/AI-LAB.git) (Branch: `main`)  

---

## 1. EXECUTIVE SUMMARY & MISSION OVERVIEW

The PIET AIML Department Smart Lab Supervision System is an enterprise-grade, multi-tier hardware and software ecosystem designed to automate attendance, monitor workstation productivity, and provide real-time remote surveillance across 5 department computer laboratories:

- **Flagship Lab:** **Lab 414** (AI, Deep Learning & High-Performance Computing Lab) — 20 High-Performance Windows Workstations
- **Lab 415:** Machine Learning & Computer Vision Lab — 20 Windows Workstations
- **Lab 416:** Data Science & Big Data Analytics Lab — 20 Windows Workstations
- **Lab 417:** Python & Algorithm Studio Lab — 20 Windows Workstations
- **Lab 418:** Capstone Projects & DGX Terminal Lab — 20 Windows Workstations

### Core Constraints & Design Directives
1. **Zero Hardware LAN Cabling Between PCs & Hubs:** Student PCs and Raspberry Pis do **not** require direct Ethernet/LAN patch cables connecting to each other. Student PCs communicate with the Raspberry Pi Hub over college Wi-Fi or campus LAN via secure Tailscale mesh networking.
2. **No Face Recognition on Student Workstations:** Face recognition is restricted exclusively to the Department Entrance Gate Security Camera (operated by the Central Server PC). Student workstations run a lightweight, non-intrusive background telemetry daemon.
3. **No Student Manual Form Filing:** Workstations automatically detect active applications, mouse/keyboard idle time, and fruitful programming hours without asking students to submit manual allotment forms.
4. **Stealth On-Demand Screenshots Only:** Workstations do **not** perform continuous video recording of desktops to conserve memory and network bandwidth. High-resolution desktop screen captures are performed strictly on-demand when requested by faculty or Dr. Richa Mam from the supervision dashboard.
5. **Clean Light Theme & High-Visibility UI:** A professional university-grade light theme (`#ffffff` & `#f8fafc`) with large `360px+` workstation blocks displaying live captured desktop screenshots directly on the grid.

---

## 2. GLOBAL CREDENTIALS, PASSKEYS, IPS & PUBLIC URLS DIRECTORY

> [!IMPORTANT]
> Keep this section confidential. It contains the complete operational passkeys and network coordinates for all devices in the ecosystem.

### A. Tailscale Mesh Network Infrastructure
- **Primary Tailscale Account:** `mukuld1511@gmail.com`
- **Tailscale Admin Console:** [https://login.tailscale.com/admin/machines](https://login.tailscale.com/admin/machines)

| Device Role | Tailscale Node Name | Tailscale IPv4 | Public Tailscale Funnel URL | Local LAN Address |
| :--- | :--- | :--- | :--- | :--- |
| **Central Server PC** (Server Room / Lab 418) | `labg418pc12` | `100.88.197.6` | `https://labg418pc12.tailc8c1f6.ts.net/` | `http://10.9.3.90:8000/` |
| **Raspberry Pi 1 Hub** (Lab 414) | `pi-lab414` / `raspberrypi` | `100.126.217.27` | `https://raspberrypi.tailc8c1f6.ts.net/` | `http://10.9.3.3:8000/` |

### B. Public Portals & Web Dashboards

1. **Lab 414 Live Workstation Supervision Hub (Raspberry Pi 1):**
   - **Public HTTPS Funnel:** [https://raspberrypi.tailc8c1f6.ts.net/](https://raspberrypi.tailc8c1f6.ts.net/)
   - **Local LAN URL:** `http://10.9.3.3:8000/`
   - **Direct Screenshot URL Pattern:** `https://raspberrypi.tailc8c1f6.ts.net/screenshots/<pc_id>.jpg`
   - **Live API Grid Endpoint:** `https://raspberrypi.tailc8c1f6.ts.net/api/lab/LAB-414/grid`

2. **Master Operations & Gate Security Hub (Central Server PC):**
   - **Public HTTPS Funnel:** [https://labg418pc12.tailc8c1f6.ts.net/](https://labg418pc12.tailc8c1f6.ts.net/)
   - **Local Address:** `http://localhost:8000/`
   - **Live Gate Camera Stream:** `http://localhost:8000/video_feed`

3. **Dr. Richa Mam's In-Charge Portal (Mobile / Remote):**
   - **Production Hosted URL (Vercel):** [https://lab-attendance-system-theta.vercel.app/](https://lab-attendance-system-theta.vercel.app/)
   - **Direct Server Path:** `https://labg418pc12.tailc8c1f6.ts.net/mams_portal/`

4. **Display Kiosk Screen (Read-Only 3D Digital Twin):**
   - **Hosted URL:** `https://labg418pc12.tailc8c1f6.ts.net/display_portal/`

### C. Backup Ngrok Static Tunnel (Central Server PC)
- **Authtoken:** `3GTmpfbFkCBLXNdvlgJp0RdJz6n_83WYHGCyrsfHJHLsTQXEi`
- **Fixed Static Domain:** `amaretto-confess-subtract.ngrok-free.dev`
- **Forwarding Target:** `localhost:8000`
- **Public URL:** `https://amaretto-confess-subtract.ngrok-free.dev`

### D. SMTP Email Dispatcher (Gmail App Password)
Used for official student workstation allocation receipts, team extension alerts, and intruder notifications.
- **SMTP Server:** `smtp.gmail.com`
- **Port:** `587` (TLS / STARTTLS)
- **SMTP Username / Email:** `nvidea.lab.piet@gmail.com`
- **Google App Password:** `ydeeyvvgdfvazuub` *(16-character space-stripped app password)*
- **Sender Display Name:** `Prof. Richa Choudhary - AI Lab`
- **Default Official Recipient:** `tutejamadhav26@gmail.com` (Madhav Tuteja, Student Lead)

---

## 3. MULTI-TIER SYSTEM ARCHITECTURE

```
                                  =========================================
                                  LEVEL 1: CENTRAL SERVER PC (ROOT CONTROL)
                                  Tailscale: labg418pc12 (100.88.197.6)
                                  Public: https://labg418pc12.tailc8c1f6.ts.net
                                  =========================================
                                                     |
             +---------------------------------------+---------------------------------------+
             |                                       |                                       |
    [Gate Webcam Index 0]               [3D Digital Twin & DB]                    [Dr. Richa Mam's Phone]
   OpenCV + 128D Face Embeds            SQLite (lab_attendance.db)                Vercel Remote App
   Real-Time Intruder Detection         SMTP Email Dispatcher                     1-Click Allotment
             |
             v
   =====================================================================================================
   LEVEL 2: DEDICATED RASPBERRY PI HUBS (1 PER LAB — 5 LABS TOTAL)
   =====================================================================================================
         |                                 |                                 |
   [PI 1: LAB 414]                   [PI 2: LAB 415]                   [PI 3: LAB 416] ... (417, 418)
   IP: 10.9.3.3 / 100.126.217.27     (Planned)                         (Planned)
   URL: https://raspberrypi...
   DB: piet_labs.db (WAL Mode)
   Services: piet-lab-hub + piet-funnel
         |
         +-------------------------------------------------------------------+
         |                                                                   |
   =====================================================================================================
   LEVEL 3: WINDOWS CLIENT WORKSTATIONS (20 PCS PER LAB)
   Silent Background Daemon: lab_414_agent.py (pythonw.exe via C:\PIET_Agent\)
   =====================================================================================================
         |                                 |                                 |
   [PC-414-01]                       [PC-414-02]                       [PC-414-20]
   • Mouse/Keyboard Idle Time        • Mouse/Keyboard Idle Time        • Mouse/Keyboard Idle Time
   • Active App & Window Title       • Active App & Window Title       • Active App & Window Title
   • Fruitful Coding Ratio           • Fruitful Coding Ratio           • Fruitful Coding Ratio
   • On-Demand Screen Grabs          • On-Demand Screen Grabs          • On-Demand Screen Grabs
```

---

## 4. LEVEL 1: CENTRAL SERVER PC (PORTALS & GATE SYSTEM)

### Repository Path: `c:\Users\serverroom\AI-LAB\lab_attendance_system\`

#### Key Scripts & Files
- `backend/main.py`: FastAPI server running on port `8000`. Handles gate camera video feed, workstation timer allocations, attendance logging, and member directory.
- `backend/camera.py`: `GateCameraManager` using DirectShow (`cv2.CAP_DSHOW`) with face embeddings extraction. Unknown visitors trigger automatic snapshots saved to `backend/static/unknown_faces/YYYY-MM-DD/`.
- `backend/database.py`: SQLite engine (`lab_attendance.db`) managing members, attendance timestamps, and PC occupancy countdowns.
- `backend/mailer.py`: SMTP dispatcher handling personalized HTML email allocations with student credentials and duration reminders.
- `backend/static/index.html`: Master Administrative Operations Center with live webcam viewer, intruder alerts gallery, manual kiosk scan, and direct link `🏛️ Lab 414 Live Hub ↗`.
- `mams_portal/index.html` & `script.js`: Mobile-optimized remote dashboard designed for Dr. Richa Choudhary with Three.js 3D Lab digital twin and partner selection dropdowns.
- `display_portal/index.html`: Read-only kiosk display mode designed for laboratory wall monitors.

#### How to Run on Server PC
To launch 24/7 background services on the Central Server PC:
```cmd
cd c:\Users\serverroom\AI-LAB\lab_attendance_system
run_desktop_app.bat
```
Or start background watchdog:
```cmd
python watchdog_24_7.py
```

---

## 5. LEVEL 2: RASPBERRY PI 1 HUB (LAB 414 SUPERVISION)

### Hardware & Operating System
- **Board:** Raspberry Pi 5 Model B Rev 1.0 (8GB RAM)
- **OS:** Debian GNU/Linux 12 (Bookworm), 64-bit
- **Power Configuration Fix:** Added `usb_max_current_enable=1` to `/boot/firmware/config.txt` to bypass boot-time USB-C PD power negotiation prompts permanently.

### Filesystem Layout on Raspberry Pi
- **Installation Directory:** `/opt/piet_system/raspberry_pi_hub/`
- **Virtual Environment:** `/opt/piet_system/raspberry_pi_hub/venv/`
- **Main Server:** `/opt/piet_system/raspberry_pi_hub/server.py`
- **Database Engine:** `/opt/piet_system/raspberry_pi_hub/database.py`
- **SQLite Database:** `/opt/piet_system/raspberry_pi_hub/piet_labs.db`
- **Static Assets:** `/opt/piet_system/raspberry_pi_hub/static/`
- **Captured Screenshots:** `/opt/piet_system/raspberry_pi_hub/static/screenshots/`

### Systemd Auto-Startup Services (Persistent Boot Automation)

Both services are enabled in systemd to ensure that whenever the Raspberry Pi powers on or reboots, everything starts automatically:

#### 1. Hub Server Service (`/etc/systemd/system/piet-lab-hub.service`)
```ini
[Unit]
Description=PIET AIML Department Smart Lab Supervision Hub
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/piet_system/raspberry_pi_hub
ExecStart=/opt/piet_system/raspberry_pi_hub/venv/bin/python3 /opt/piet_system/raspberry_pi_hub/server.py
Restart=always
RestartSec=3
TimeoutStopSec=10

[Install]
WantedBy=multi-user.target
```

#### 2. Tailscale Funnel Auto-Start Service (`/etc/systemd/system/piet-funnel.service`)
```ini
[Unit]
Description=Tailscale Funnel Auto-Start for PIET Lab Hub
After=network-online.target tailscaled.service piet-lab-hub.service
Wants=network-online.target tailscaled.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/tailscale funnel --bg 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Complete 1-Click Update Script on Raspberry Pi
Whenever git code is updated, run these commands on the Raspberry Pi:
```bash
git pull
sudo bash piet_system/update_raspberry_pi.sh
```

---

## 6. LEVEL 3: WINDOWS CLIENT WORKSTATION AGENT (STUDENT PCS)

### Repository Path: `c:\Users\serverroom\AI-LAB\piet_system\lab_414_windows_agent\`

### The 1-Line Deployment Command (Zero Git Clone Required)
On **ANY** Windows PC in Lab 414 (without cloning the repository or copying git files):

#### Option A: In Windows PowerShell
```powershell
irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1 | iex
```

#### Option B: In Command Prompt (CMD)
```cmd
powershell -c "irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1 | iex"
```

### What `setup_pc.ps1` Does:
1. Prompts for PC number (e.g., `01`, `02`, `15`) and formats it as `PC-414-XX`.
2. Creates isolated folder `C:\PIET_Agent\`.
3. Downloads `lab_414_agent.py` directly from GitHub (only 12 KB).
4. Generates `agent_config.json` with target `hub_url: "https://raspberrypi.tailc8c1f6.ts.net"`.
5. Installs lightweight requirements (`psutil`, `pillow`).
6. Registers Windows Scheduled Task (`PIET_Lab414_Agent`) to start on user logon.
7. Adds backup shortcut in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\run_piet_agent.bat`.
8. Launches `pythonw.exe` **silently in the background** so closing the terminal does **not** stop the agent.

### Local Agent Configuration (`C:\PIET_Agent\agent_config.json`)
```json
{
    "pc_id": "PC-414-01",
    "lab_id": "LAB-414",
    "hub_url": "https://raspberrypi.tailc8c1f6.ts.net",
    "heartbeat_interval": 6,
    "idle_threshold_seconds": 180
}
```

### How the Agent Classifies Activity
The agent inspects active foreground windows using Win32 API (`GetForegroundWindow`, `GetWindowTextW`) and measures physical mouse/keyboard idle seconds using `GetLastInputInfo`:

| Classified State | Condition | Display Badge |
| :--- | :--- | :--- |
| **🎯 Fruitful (Coding)** | Active window contains keywords: `VS Code`, `PyCharm`, `Jupyter`, `Python`, `GitHub`, `Terminal`, `MATLAB`, `Postman`, `Kaggle`, `Colab`, `LeedCode`, `StackOverflow` | Soft Blue Pill (`#dbeafe`) |
| **💤 Idle** | User has not touched physical mouse or keyboard for > 180 seconds (`idle_seconds >= 180`) | Soft Amber Pill (`#fef3c7`) |
| **⚠️ Distracted** | Active window contains banned keywords: `Netflix`, `YouTube`, `Instagram`, `Gaming`, `Steam`, `Spotify`, `Torrent` | Soft Red Pill (`#fee2e2`) |
| **⚪ Normal** | General desktop usage, File Explorer, System Settings | Soft Slate Pill (`#f1f5f9`) |

---

## 7. DATABASE SCHEMAS & DATA STRUCTURES

### SQLite Database on Raspberry Pi: `piet_labs.db`

#### Table 1: `labs` (Department Laboratory Directory)
```sql
CREATE TABLE IF NOT EXISTS labs (
    lab_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    total_pcs INTEGER DEFAULT 20,
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1
);
```

#### Table 2: `workstations` (Workstation Telemetry & Live State)
```sql
CREATE TABLE IF NOT EXISTS workstations (
    pc_id TEXT PRIMARY KEY,
    lab_id TEXT NOT NULL DEFAULT 'LAB-414',
    ip_address TEXT DEFAULT '',
    is_online INTEGER DEFAULT 0,
    last_heartbeat TEXT DEFAULT '',
    boot_time TEXT DEFAULT '',
    uptime_seconds INTEGER DEFAULT 0,
    active_work_seconds INTEGER DEFAULT 0,
    fruitful_seconds INTEGER DEFAULT 0,
    idle_seconds INTEGER DEFAULT 0,
    distracted_seconds INTEGER DEFAULT 0,
    cpu_percent REAL DEFAULT 0.0,
    ram_percent REAL DEFAULT 0.0,
    ram_used_gb REAL DEFAULT 0.0,
    ram_total_gb REAL DEFAULT 0.0,
    gpu_name TEXT DEFAULT '',
    gpu_percent REAL DEFAULT 0.0,
    gpu_temp REAL DEFAULT 0.0,
    active_window TEXT DEFAULT '',
    active_app TEXT DEFAULT '',
    activity_type TEXT DEFAULT 'neutral',
    top_processes TEXT DEFAULT '[]',
    has_warning INTEGER DEFAULT 0,
    warning_reason TEXT DEFAULT '',
    last_screenshot_at TEXT DEFAULT '',
    pending_command TEXT DEFAULT '',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
);
```

#### Table 3: `timetable` (Weekly Lab Scheduling)
```sql
CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lab_id TEXT NOT NULL DEFAULT 'LAB-414',
    day_of_week TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    subject TEXT NOT NULL,
    faculty TEXT NOT NULL,
    batch TEXT NOT NULL
);
```

---

## 8. REST APIS & ENDPOINTS DIRECTORY

### Raspberry Pi Hub API (Port 8000)

| Endpoint | Method | Caller | Payload / Query | Description |
| :--- | :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Anyone | None | Returns JSON health check (`online`, active lab, timestamp). |
| `/api/heartbeat` | `POST` | Windows PC Agent | `HeartbeatPayload` JSON | Ingests PC metrics; returns pending remote commands (e.g. `capture_screen`). |
| `/api/lab/{lab_id}/grid` | `GET` | Web Dashboard | `lab_id` (e.g. `LAB-414`) | Returns full 20 PC status array, fruitful stats, active timetable slot. |
| `/api/command` | `POST` | Web Dashboard | `{"pc_id": "...", "command": "capture_screen"}` | Dispatches stealth command to workstation. |
| `/api/screenshot` | `POST` | Windows PC Agent | `{"pc_id": "...", "image_base64": "..."}` | Saves screen capture to `static/screenshots/<pc_id>.jpg`. |
| `/screenshots/{filename}` | `GET` | Web Browser | None | Direct image URL to view captured screen. |
| `/api/timetable/{lab_id}` | `GET` | Web Dashboard | `lab_id` | Fetches active lecture slot and weekly department timetable. |
| `/api/reports/daily` | `GET` | Web Dashboard | `date` (optional) | Generates printable daily departmental utilization report. |

---

## 9. STEP-BY-STEP REPRODUCIBILITY GUIDE (HOME & CAMPUS HANDOFF)

### How to Work on This System From Home

When working from home without being physically present in the college lab:
1. **Pull the Repository:**
   ```bash
   git pull origin main
   ```
2. **Access the Live Raspberry Pi Hub Over Internet:**
   - Open [https://raspberrypi.tailc8c1f6.ts.net/](https://raspberrypi.tailc8c1f6.ts.net/) in any browser (phone or laptop).
   - Because Tailscale Funnel is running in the background, you can inspect the lab PCs and grid from anywhere in the world.
3. **Simulate a Workstation Heartbeat from Home:**
   You can send test telemetry from your home computer to see it appear live on the Pi:
   ```cmd
   python piet_system\lab_414_windows_agent\lab_414_agent.py 01
   ```
4. **Develop UI Improvements Locally:**
   - Files are located in `piet_system/raspberry_pi_hub/static/`.
   - Modify `index.html`, `style.css`, or `app.js`.
   - Commit and push to git:
     ```bash
     git add . ; git commit -m "update UI" ; git push origin main
     ```
   - On the Raspberry Pi, run `git pull && sudo bash piet_system/update_raspberry_pi.sh` to deploy.

---

## 10. TROUBLESHOOTING & KNOWN ISSUES SOLVED

| Issue Observed | Root Cause | Solution Implemented |
| :--- | :--- | :--- |
| **Raspberry Pi boot prompt: "Power supply unable to provide 5A"** | Pi 5 checks for 5V 5A PD supply before enabling full USB high-current mode. | Added `usb_max_current_enable=1` to `/boot/firmware/config.txt`. Reboots without keypress. |
| **Tailscale Funnel command syntax error: `unknown command: 8000 on`** | Newer Tailscale CLI versions changed syntax. | Updated to `sudo tailscale funnel --bg 8000`. |
| **PC showed `⚪ OFFLINE` after 49 seconds** | Agent ran in foreground PowerShell window; closing window killed process. Server timed out after 25s. | Updated `setup_pc.ps1` to launch `pythonw.exe` silently as persistent background task. Increased server cutoff to 90s. |
| **Screenshots returned HTTP 404** | `server.py` mounted `StaticFiles` only at `/` instead of `/static` and `/screenshots`. | Added explicit mounts in `server.py`: `app.mount("/screenshots", ...)` and `app.mount("/static", ...)`. |
| **Briefing modal not opening on click** | `closeModal()` missing in JS; CSS selector mismatch (`.modal-backdrop.active` vs `.show`). | Defined `closeModal()`, added `.show` to CSS, and bound `modal.style.display = 'flex'`. |

---

## 11. REMAINING TASKS & ROADMAP FOR TOMORROW

1. **Deploy Agent to Lab 414 Workstations:**
   - Open PowerShell on `PC-414-02` through `PC-414-20`.
   - Run: `irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1 | iex`
   - Enter respective PC number (`02`, `03`, etc.).
2. **Verify Live 20-PC Grid:**
   - Check [https://raspberrypi.tailc8c1f6.ts.net/](https://raspberrypi.tailc8c1f6.ts.net/) to verify all workstations show green `🟢 ONLINE` badges with their desktop screens visible.
3. **Scale to Raspberry Pi 2 (Lab 415):**
   - Flash Raspberry Pi 2 SD card.
   - Run `setup_pi.sh` with Lab identifier `LAB-415`.
   - Repeat for Labs 416, 417, 418.
4. **Dr. Richa Mam's Final Department Sign-Off:**
   - Demonstrate 1-click screen capture, fruitful coding ratio tracking, and intruder email alerts on Mam's phone.
