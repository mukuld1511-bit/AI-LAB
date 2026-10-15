# PIET AIML Department — Central Supervision Master Server

## 🏛️ System Architecture Overview

This package contains the **Central Department Master Server** for the PIET Department of Artificial Intelligence & Machine Learning. 

> **Important Architecture Note:**
> This server runs on a **Dedicated Central Department PC** (e.g. Server Room / HOD Master PC on SSD/NVMe).
> It is **strictly separate** from the AI Research Lab (Lab 418) backend server.

```
 LEVEL 1: WORKSTATIONS (100 Student PCs)
 ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
 │ Lab 414: 20 PCs │  │ Lab 415: 20 PCs │  │ Lab 416: 20 PCs │  │ Lab 417: 20 PCs │  │ Lab 418: 20 PCs │
 └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
          │ (Local LAN)        │ (Local LAN)        │ (Local LAN)        │ (Local LAN)        │ (Local LAN)
          ▼                    ▼                    ▼                    ▼                    ▼
 LEVEL 2: EDGE HUBS (5 Raspberry Pis)
 ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
 │  Raspberry Pi 1 │  │  Raspberry Pi 2 │  │  Raspberry Pi 3 │  │  Raspberry Pi 4 │  │  Raspberry Pi 5 │
 │ (Lab 414 Edge)  │  │ (Lab 415 Edge)  │  │ (Lab 416 Edge)  │  │ (Lab 417 Edge)  │  │ (Lab 418 Edge)  │
 └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
          │                    │                    │                    │                    │
          └────────────────────┴──────────┬─────────┴────────────────────┴────────────────────┘
                                          │ (Campus Network / Tailscale / LAN)
                                          ▼
 LEVEL 3: CENTRAL MASTER PC (Dedicated Department Machine)
 ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 │                         PIET DEPARTMENT CENTRAL MASTER SERVER                               │
 │                                                                                             │
 │  • High-Performance SSD Database: piet_department_master.db (WAL Mode)                     │
 │  • Central Supervision Web Portal: Official PIET Green (#008b38) Dashboard                  │
 │  • 55-Minute Period Auto-Archiver: 09:05 - 16:25 (7 Academic Periods + Recess)              │
 │  • NBA Criterion 4 Audit Exporter: CSV / JSON Utilization Logs                              │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Specifications

| Component | Detail |
| :--- | :--- |
| **Total Labs** | 5 Labs (`LAB-414`, `LAB-415`, `LAB-416`, `LAB-417`, `LAB-418`) |
| **Workstations per Lab** | Exactly 20 PCs per lab (`PC-414-01` to `PC-414-20`, etc.) |
| **Total Monitored PCs** | 100 Workstations |
| **Edge Gateways** | 5 Raspberry Pis (1 per Lab) |
| **Central Master Host** | Dedicated Department PC (Port 8080 or 8000) |
| **Lecture Period Duration** | **55 Minutes** per period |
| **Daily College Hours** | **09:05 AM to 04:25 PM** |
| **Storage Engine** | SQLite 3 with Write-Ahead Logging (WAL) on SSD/NVMe |

---

## ⏰ Official 55-Minute Period Schedule

| Period | Time Slot | Duration | Academic Usage |
| :---: | :---: | :---: | :--- |
| **P1** | `09:05 - 10:00` | 55 Min | Practical Lab Block A (Part 1) |
| **P2** | `10:00 - 10:55` | 55 Min | Practical Lab Block A (Part 2) |
| **P3** | `10:55 - 11:50` | 55 Min | Practical Lab Block B (Part 1) |
| **P4** | `11:50 - 12:45` | 55 Min | Practical Lab Block B (Part 2) |
| 🥪 **Recess** | `12:45 - 13:40` | 55 Min | Lunch Break & System Sync |
| **P5** | `13:40 - 14:35` | 55 Min | Practical Lab Block C (Part 1) |
| **P6** | `14:35 - 15:30` | 55 Min | Practical Lab Block C (Part 2) |
| **P7** | `15:30 - 16:25` | 55 Min | Capstone / Research Seminar / Doubt Clinic |

*Faculty designation for Dr. Richa Choudhary is strictly recorded as **"Dr. Richa Choudhary, Assistant Professor"** across all timetables and audit reports.*

---

## 🚀 1-Click Deployment on the New Master PC

1. **Copy this entire folder** (`piet_system/central_master_pc`) to the new Master PC.
2. Double-click `run_master_server.bat` to install dependencies and start the server.
3. Access the portal at:
   - **Local:** `http://localhost:8080/`
   - **Network:** `http://<MASTER_PC_IP>:8080/`
4. To enable **24/7 background autostart on Windows boot**, open PowerShell as Administrator and run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install_master_service.ps1
   ```

---

## 📡 Configuring the 5 Raspberry Pis to Connect Upstream

On each of the 5 Raspberry Pis (in `piet_system/raspberry_pi_hub/` or via environment variable):
Set the master URL in `server.py` or `.env`:
```bash
export MAIN_LOCAL_PC_URL="http://<MASTER_PC_IP>:8080"
```
Each Pi will then automatically stream its 20 local PCs' telemetry to this Central Master PC!
