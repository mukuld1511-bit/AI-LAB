# 🏛️ PIET AIML Department — Smart Lab Supervision System

An autonomous, multi-lab Windows workstation supervision, real-time activity classification, and productive ("fruitful") work tracking ecosystem designed specifically for the **Panipat Institute of Engineering and Technology (PIET) AI & ML Department**.

---

## 🌟 Key Architecture Highlights

1. **Zero Student Friction (No Allotment)**:
   - Students sit at any PC, turn it on, and start coding. No registration forms, no login delays.
2. **5 Department Labs with Flagship Lab 414**:
   - Lab 414 (AI & Deep Learning)
   - Lab 415 (Machine Learning & Vision)
   - Lab 416 (Data Science & Big Data)
   - Lab 417 (Python & Core AI)
   - Lab 418 (Capstone Projects & Research)
3. **Fruitful Work vs. Idle Tracker**:
   - Uses native Win32 `GetLastInputInfo` to measure user keyboard/mouse activity with millisecond accuracy.
   - Automatically classifies apps:
     - 🟢 **Fruitful (Productive)**: VS Code, Jupyter, PyTorch, Colab, Python, Terminal, GitHub, etc.
     - 🟡 **Idle**: No mouse/keyboard touch for > 3 minutes.
     - 🔴 **Distracted / Unauthorized**: Games (Steam, Valorant, Minecraft, GTA), YouTube, Netflix, etc.
4. **Teacher's 2-Minute Plug-and-Play Workflow**:
   - Turn on lab router / Raspberry Pi on the wall.
   - Within 2 minutes, all Lab 414 PCs auto-connect.
   - Teacher opens the web app on their phone or laptop, views the full live grid, checks active session, and inspects screens on-demand.
   - Turn off router when class ends — zero data entry!
5. **Timetable Sync & Daily Reports**:
   - Auto-detects current active lecture/practical from uploaded schedule.
   - Generates daily utilization and compliance reports exportable to PDF/CSV for HOD and department archives.

---

## 📁 System Structure

```
piet_system/
├── raspberry_pi_hub/                 # Dedicated Raspberry Pi 5 Central Hub Server
│   ├── server.py                     # FastAPI Hub Server (Port 8000)
│   ├── database.py                   # SQLite WAL Engine (Labs, PCs, Timetable, Analytics)
│   ├── requirements.txt              # Minimal fast dependencies
│   ├── setup_pi.sh                   # 1-Click Pi 5 Auto-Startup Systemd Installer
│   └── static/                       # Modern Glassmorphic Web App
│       ├── index.html                # Multi-Lab Grid & Real-time Monitor
│       ├── style.css                 # Cyber-slate dark mode design system
│       └── app.js                    # Real-time state polling, lightbox, and analytics
│
└── lab_414_windows_agent/            # Dedicated Windows Client Agent for Lab 414 PCs
    ├── lab_414_agent.py              # Win32 Native Agent (Uptime, Fruitful tracker, Snaps)
    ├── agent_config.json             # Local PC & Hub URL config
    ├── install_lab_414_agent.bat     # 1-Click Windows Task Scheduler Installer
    ├── run_agent_test.bat            # Quick Interactive Console Tester
    └── uninstall_agent.bat           # Clean uninstaller
```

---

## 🚀 Deployment Guide

### A. Setting Up the Raspberry Pi 5 Central Hub
*(Run once on the Raspberry Pi 5 connected to the Lab Router)*

1. Copy `raspberry_pi_hub/` folder to the Pi (or clone via Git).
2. Open terminal on the Pi and run:
   ```bash
   sudo bash setup_pi.sh
   ```
3. That's it! The service `piet-lab-hub.service` is now enabled and will start automatically whenever the Pi/router powers on.
4. Open on teacher's phone/laptop: `http://<PI_IP>:8000/` or Tailscale Funnel.

---

### B. Setting Up Windows Workstations in Lab 414 (PC-01 to PC-30)
*(Run once on each Windows PC in Lab 414)*

1. Open Command Prompt as Administrator on the student PC.
2. Run:
   ```cmd
   install_lab_414_agent.bat 05
   ```
   *(Replace `05` with the PC's number, e.g. `01`, `02`, `15`, `30`).*
3. The script:
   - Configures the PC identifier as `PC-414-05`.
   - Registers a silent background task in Windows Task Scheduler.
   - Starts the agent immediately via `pythonw.exe` (no terminal window stays open).
   - Will automatically start on every PC reboot.

---

### C. Useful Commands on Windows Client
- **Interactive Test**: Double-click `run_agent_test.bat` to see live console output.
- **Uninstall**: Run `uninstall_agent.bat` to stop the background agent and remove the task.
