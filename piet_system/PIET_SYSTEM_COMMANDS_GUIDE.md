# 🏛️ PIET DEPARTMENT MULTI-LAB SUPERVISION SYSTEM COMMANDS GUIDE
### Panipat Institute of Engineering & Technology • Department-Wide Multi-Lab Architecture
> **Boundary Note:** This documentation belongs **strictly to the PIET Multi-Lab System** (Labs 413, 414, 415, 416, 418, 419 — 24 PCs per lab, 144 PCs total).  
> It is **completely isolated** from the AI Lab Attendance System (`lab_attendance_system/`). Do not mix configs or endpoints!

---

## 🏗️ Architecture & Network Layout

```
                  ┌────────────────────────────────────────┐
                  │      PIET CENTRAL MASTER SERVER        │
                  │   Master PC • Port 8088 (or 8080)      │
                  │  Tailscale: labg418pc12.tailc8c1f6.ts  │
                  │  Aggregates all 6 Labs & 144 PC Slots  │
                  └───────────────────▲────────────────────┘
                                      │ (LAN / Tailscale Secure Relay)
       ┌──────────────┬───────────────┼───────────────┬──────────────┬──────────────┐
       │              │               │               │              │              │
┌──────┴──────┐┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐┌──────┴──────┐┌──────┴──────┐
│   LAB 413   ││   LAB 414   │ │   LAB 415   │ │   LAB 416   ││   LAB 418   ││   LAB 419   │
│  (24 PCs)   ││  (24 PCs)   │ │  (24 PCs)   │ │  (24 PCs)   ││  (24 PCs)   ││  (24 PCs)   │
└─────────────┘└─────────────┘ └─────────────┘ └─────────────┘└─────────────┘└─────────────┘
```

* **Supervised Labs:** Lab 413, Lab 414, Lab 415, Lab 416, Lab 418, Lab 419.
* **Workstations per Lab:** Exactly 24 PCs per lab (e.g., `PC-414-01` to `PC-414-24`, `PC-413-01` to `PC-413-24`, etc.).
* **Active Central Host:** `https://labg418pc12.tailc8c1f6.ts.net` (Server Room Master Host).
* **Supervision Engine:** Win32 physical keyboard/mouse idle detection, active window & process tracking, productive vs distracted classification, on-demand high-res desktop captures, 55-minute NBA lecture slots.

---

## 🖥️ Section 1: Universal 1-Time Workstation Setup (Any PC in Any Lab)

Har PC par sirf **EK BAAR** ye command chalani hai. Uske baad ye boot par apne aap start hoga aur auto-update rahega!

### Method 1: Ultra-Fast One-Liner (Pass Lab & PC Number)
Workstation par **PowerShell** kholein (`Win + R` -> `powershell` -> Enter) aur command run karein:

```powershell
# Format: setup.ps1 [LAB_NUMBER] [PC_NUMBER]

# Example: Lab 414, PC 05:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1))) 414 5

# Example: Lab 413, PC 12:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1))) 413 12

# Example: Lab 415, PC 24:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1))) 415 24

# Example: Lab 418, PC 01:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1))) 418 1

# Example: Lab 419, PC 18:
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1))) 419 18
```

---

### Method 2: Universal Copy-Paste (Interactive Prompt Mode)
Agar aap har PC par exact same command paste karna chahte hain aur number type karna chahte hain:

```powershell
irm https://raw.githubusercontent.com/mukuld1511-bit/AI-LAB/main/piet_system/setup.ps1 | iex
```
*Screen par prompt aayega:*
```text
Enter Lab Number (e.g. 413, 414, 415, 416, 418, 419): 414
Enter PC Number in Lab 414 (1 to 24): 5
```
Type karke Enter dabayein, aur setup automatic complete ho jayega!

---

### ⚙️ Is 1-Time Command Se Kya Hota Hai:
1. Python 3 runtime verify karta hai (agar PC par Python nahi hai, to official Python 3.10 silently background me auto-install kar deta hai).
2. `C:\PIET_Agent` folder me latest `piet_agent.py` aur alert HUD module download karta hai.
3. Dependencies (`psutil`, `pillow`) auto-install karta hai.
4. Windows **Task Scheduler** me permanent task `PIET_Workstation_Agent` create karta hai jo `onlogon` par highest privileges ke sath silent `pythonw.exe` me start ho jata hai.
5. Startup folder me fallback `.bat` register karta hai.
6. **Auto-Update Engine:** Har 15 minute me silent background hash check karta hai aur Central Dashboard se remote update accept karta hai.
7. **Iske baad is PC ko kabhi dobara touch nahi karna padega!**

---

## 🎛️ Section 2: Central Master Server Management (Server Room Master PC)

### 1. Master Server Start
Double-click `run_master_server.bat` ya terminal me:

```cmd
cd c:\Users\serverroom\AI-LAB\piet_system\central_master_pc
python server.py
```

### 2. Live Health & Multi-Lab Status Verification
Browser ya curl me check karein:
* **Health Check:** `http://localhost:8080/health` (ya Funnel `https://labg418pc12.tailc8c1f6.ts.net/health`)
* **Department Grid Status:** `http://localhost:8080/api/department/status`
* **Download All Screenshots:** `http://localhost:8080/api/department/download_all_screenshots`
* **Trigger Department-Wide Auto-Update:** `curl -X POST http://localhost:8080/api/department/update_all`

---

## ⚠️ Section 3: Remote Supervised Commands

Central Master Dashboard se kisi bhi workstation par remote actions bheje ja sakte hain:
* `capture_screen`: Instantly grabs screen and uploads JPEG to Master SSD.
* `warn:<message>`: Displays high-priority modern Dark Glass HUD with audio tone:  
  **Designation:** `Dr. Richa Choudhary, Assistant Professor`
* `lock`: Locks the Windows workstation session immediately.
* `shutdown`: Graceful 5-second shutdown.
* `restart`: Graceful 5-second reboot.
* `kill:<PID>`: Terminates rogue games or unauthorized processes.
* `update`: Triggers instant hot-update of the client script via GitHub raw.
