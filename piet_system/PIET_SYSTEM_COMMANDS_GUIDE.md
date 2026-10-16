# 🏛️ PIET DEPARTMENT 5-LAB SUPERVISION SYSTEM COMMANDS GUIDE
### Panipat Institute of Engineering & Technology • Department-Wide Multi-Lab Architecture
> **Boundary Note:** This documentation belongs **strictly to the PIET 5-Lab System** (Lab 414, 415, 416, 417, 418 — 20 PCs per lab, 100 PCs total).  
> It is **completely isolated** from the AI Lab Attendance System (`lab_attendance_system/`). Do not mix configs or endpoints!

---

## 🏗️ Architecture & Network Layout

```
                  ┌────────────────────────────────────────┐
                  │      PIET CENTRAL MASTER SERVER        │
                  │   Master PC • Port 8088 (or 8080)      │
                  │  Aggregates all 5 Labs & 100 PC Slots  │
                  └───────────────────▲────────────────────┘
                                      │ (LAN / Tailscale Relay)
       ┌──────────────────────────────┼──────────────────────────────┐
       │                              │                              │
┌──────┴──────┐                ┌──────┴──────┐                ┌──────┴──────┐
│  PI-414 HUB │                │  PI-415 HUB │                │  PI-418 HUB │
│(Raspberry 5)│                │(Raspberry 5)│                │(Raspberry 5)│
└──────▲──────┘                └──────▲──────┘                └──────▲──────┘
       │                              │                              │
┌──────┴──────────────┐        ┌──────┴──────────────┐        ┌──────┴──────────────┐
│  Lab 414 Workstations│        │  Lab 415 Workstations│        │  Lab 418 Workstations│
│(PC-414-01 to 20)    │        │(PC-415-01 to 20)    │        │(PC-418-01 to 20)    │
└─────────────────────┘        └─────────────────────┘        └─────────────────────┘
```

* **Lab Edge Gateways:** 5x Raspberry Pi 5 hubs (1 per lab).
  * **Lab 414 Pi 5 Hub URL:** `https://raspberrypi.tailc8c1f6.ts.net` (or local LAN `http://<PI_LOCAL_IP>:8000`)
* **Workstation Allocation:** Exactly 20 PCs per lab (e.g., `PC-414-01` to `PC-414-20`).
* **NBA Criterion 4 & Timetable Engine:** 55-minute lecture slots auto-archived into SQLite DB & CSV audit reports.

---

## 🖥️ Section 1: Lab 414 Workstation Setup (Windows PCs 01 to 20)

### Method 1: Ultra-Fast One-Liner (Zero Prompts)
Open **PowerShell** on any Lab 414 PC (`Win + R` -> `powershell` -> Enter) and run the command matching the PC number:

```powershell
# On PC 01:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1))) 1

# On PC 02:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1))) 2

# On PC 20:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1))) 20
```

---

### Method 2: Universal Copy-Paste (Prompt Mode)
If you prefer pasting the exact same command on all 20 PCs:

```powershell
irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/lab_414_windows_agent/setup_pc.ps1 | iex
```
*Prompt:* `Enter PC Number in Lab 414 (e.g. 01, 02, 15): ` -> Type `01`, `02`, etc., and hit Enter!

---

### Method 3: Live Console Test Mode (Interactive Output)
To test connectivity and observe real-time heartbeats:

```powershell
cd c:\Users\serverroom\AI-LAB\piet_system\lab_414_windows_agent
python lab_414_agent.py 1
```

---

## 🍓 Section 2: Raspberry Pi 5 Edge Hub Setup (Lab 414)

### 1. 1-Click Initial Pi 5 Setup
On the Raspberry Pi 5 terminal (running Raspberry Pi OS 64-bit):

```bash
git clone https://github.com/mukuld1511-bit/AI-LAB.git
cd AI-LAB/piet_system
sudo bash setup_raspberry_1_lab414.sh
```

### 2. Updating Pi 5 Hub Code
To pull updates and refresh the hub without re-installing dependencies:

```bash
cd ~/AI-LAB/piet_system
sudo bash update_raspberry_pi.sh
```

### 3. Pi Hub Service Management
```bash
# Check Pi 5 Hub status
sudo systemctl status piet-hub.service

# Restart Pi 5 Hub
sudo systemctl restart piet-hub.service

# View live incoming heartbeats
sudo journalctl -u piet-hub.service -f
```

---

## 🏢 Section 3: Central Department Master PC Server

Runs on the Server Room Master PC to aggregate all 5 labs into a single central dashboard.

### 1. Start Master Server
```powershell
cd c:\Users\serverroom\AI-LAB\piet_system\central_master_pc
python server.py
```
*Default URL: `http://localhost:8088/` (or `http://0.0.0.0:8080` if port 8080 is available)*

### 2. Core Central Endpoints
* **Central 5-Lab Dashboard:** `http://localhost:8088/`
* **Department Overview API:** `http://localhost:8088/api/overview`
* **NBA Criterion 4 Audit CSV Export:** `http://localhost:8088/api/export/csv`

---

## ⚠️ Section 4: Remote Control & Emergency Protocol

From the supervision portal (`https://raspberrypi.tailc8c1f6.ts.net/` or `http://localhost:8088/`):

1. **⚠️ Send Alert (`warn:<message>`):**  
   Instantly pops up the unmissable dark glass HUD on the target workstation:  
   **Designation:** `Dr. Richa Choudhary, Assistant Professor`  
   Includes alert audio chime (`MB_ICONEXCLAMATION`) and stays on top.
2. **🛑 Bulk Lab Power (`/api/lab/{lab_id}/power`):**  
   Allows one-click **Shutdown**, **Restart**, or **Lock** for all 20 PCs in a lab simultaneously (excluding protected host machine).
3. **📸 Live On-Demand Desktop Screen Capture:**  
   Captures active desktop session and updates the teacher briefing modal in seconds.
