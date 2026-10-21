# 🏛️ PIET DEPARTMENT 5-LAB CENTRAL SUPERVISION SYSTEM GUIDE
### Panipat Institute of Engineering & Technology • Department-Wide Multi-Lab Architecture
> **Boundary Note:** This system belongs **strictly to the PIET Multi-Lab System** (Labs 413, 414, 415, 418, 419 — 24 PCs per lab = 120 PCs total).  
> A single **Raspberry Pi 5** serves as the 24/7 central hub for all 5 labs.  
> It is **completely isolated** from the AI Lab Attendance System (`lab_attendance_system/`). Do not mix configs or endpoints!

---

## 🏗️ Architecture & Network Layout

```
                  ┌────────────────────────────────────────┐
                  │      CENTRAL RASPBERRY PI 5 HUB        │
                  │   Tailscale: raspberrypi.tailc8c1f6.ts │
                  │   FastAPI Hub • Port 8000 / Funnel     │
                  │   Supervises 5 Labs (120 PC Slots)     │
                  └───────────────────▲────────────────────┘
                                      │ (LAN / Tailscale Relay)
       ┌──────────────┬───────────────┼───────────────┬──────────────┐
       │              │               │               │              │
┌──────┴──────┐┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐┌──────┴──────┐
│   LAB 413   ││   LAB 414   │ │   LAB 415   │ │   LAB 418   ││   LAB 419   │
│  (24 PCs)   ││  (24 PCs)   │ │  (24 PCs)   │ │  (24 PCs)   ││  (24 PCs)   │
└─────────────┘└─────────────┘ └─────────────┘ └─────────────┘└─────────────┘
```

* **Supervised Labs:** Lab 413, Lab 414, Lab 415, Lab 418, Lab 419.
* **Workstations per Lab:** Exactly 24 PCs per lab (`PC-413-01`..`24`, `PC-414-01`..`24`, `PC-415-01`..`24`, `PC-418-01`..`24`, `PC-419-01`..`24`).
* **Active Central Hub Host:** `https://raspberrypi.tailc8c1f6.ts.net/`
* **Supervision Engine:** Win32 physical keyboard/mouse idle detection, active window & process tracking, productive vs distracted classification, on-demand high-res desktop captures, 55-minute NBA lecture slots.

---

## 🍓 Section 1: Raspberry Pi 5 Update & Setup (Single Command)

Raspberry Pi par terminal kholein (SSH ya direct) aur ye single command run karein:

```bash
curl -sSL https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/update_raspberry_pi.sh | sudo bash
```

### ⚙️ Is Command Se Kya Hota Hai:
1. DNS auto-heal (`8.8.8.8` / `1.1.1.1`).
2. GitHub se latest code pull / clone karta hai.
3. 5 Labs (120 PCs) ka database schema initialize karta hai.
4. `piet-lab-hub.service` systemd service install & start karta hai (boot par auto-start).
5. `piet-funnel.service` Tailscale Funnel auto-start configure karta hai.
6. Central Dashboard live: **`https://raspberrypi.tailc8c1f6.ts.net/`**

---

## 🖥️ Section 2: 5 Labs Client Setup Commands (Windows Workstations)

Har student PC par PowerShell me sirf **EK BAAR** command chalani hai. Uske baad ye boot par apne aap background me start hoga!

### ⚡ Method A: Lab-Specific 1-Line Commands (Recommended)

Workstation par **PowerShell** kholein (`Win + R` -> `powershell` -> Enter):

#### 🏢 Lab 413 (PC 1 to 24):
```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 413 [PC_NUMBER]
# Example for PC-413-05:
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 413 5
```

#### 🏢 Lab 414 (PC 1 to 24):
```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 414 [PC_NUMBER]
# Example for PC-414-12:
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 414 12
```

#### 🏢 Lab 415 (PC 1 to 24):
```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 415 [PC_NUMBER]
# Example for PC-415-08:
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 415 8
```

#### 🏢 Lab 418 (PC 1 to 24):
```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 418 [PC_NUMBER]
# Example for PC-418-01:
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 418 1
```

#### 🏢 Lab 419 (PC 1 to 24):
```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 419 [PC_NUMBER]
# Example for PC-419-24:
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 -OutFile s.ps1; .\s.ps1 419 24
```

---

### 📋 Method B: Universal Copy-Paste (Interactive Prompt Mode)
Agar aap har PC par exact same command paste karna chahte hain:

```powershell
irm https://raspberrypi.tailc8c1f6.ts.net/setup.ps1 | iex
```
*Screen par prompt aayega:*
```text
Enter Lab Number (e.g. 413, 414, 415, 418, 419): 414
Enter PC Number in Lab 414 (1 to 24): 5
```
Type karke Enter dabayein, setup automatic complete ho jayega!

---

### ⚙️ Client Setup Se Kya Hota Hai:
1. Python 3 runtime verify karta hai (agar PC par Python nahi hai, official Python 3.10 silently background me install karta hai).
2. `C:\PIET_Agent` folder me telemetry agent aur HUD alert module setup karta hai.
3. Dependencies (`psutil`, `pillow`) auto-install karta hai.
4. Windows **Task Scheduler** me permanent task `PIET_Workstation_Agent` create karta hai jo `onlogon` par highest privileges ke sath silent `pythonw.exe` me start ho jata hai.
5. Startup folder me fallback `.bat` register karta hai.
6. Auto-updates silently every 15 minutes via GitHub / Pi Hub.
7. Telemetry streaming live to `https://raspberrypi.tailc8c1f6.ts.net`.

---

## 🎛️ Section 3: Central Supervision Web App

* **Live Dashboard:** `https://raspberrypi.tailc8c1f6.ts.net/`
* **Local LAN URL:** `http://10.9.3.3:8000/` (or Raspberry Pi LAN IP)
* **Features:**
  - 5-Lab Switcher Ribbon (Lab 413, Lab 414, Lab 415, Lab 418, Lab 419).
  - 120 Interactive Workstation Cards with real-time productive vs distracted status.
  - Remote Actions: Screen Capture, Academic Alert Modal (`Dr. Richa Choudhary`), Lock Workstation, Shutdown, Reboot.
  - NBA Criterion 4 Lab Utilization CSV Report export.

