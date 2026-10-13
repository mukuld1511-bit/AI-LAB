# 🖥️ AI/ML Lab PC — 24/7 Deployment & Setup Guide

**In-Charge:** Prof. Richa Choudhary  
**Permanent Cloud Domain:** `https://amaretto-confess-subtract.ngrok-free.dev`  
**Localhost Port:** `http://localhost:8000`

---

## 📌 Summary (English / हिंदी)

This guide explains how to copy the **AI/ML Lab Attendance & PC Tracking System** to any dedicated Windows desktop in your college laboratory, set it up with one click, and keep it running **24/7 permanently**.

Even if there is a power cut, PC reboot, or internet disconnection:
- The **Watchdog Supervisor** (`watchdog_24_7.py`) automatically restarts the FastAPI backend and camera if they ever stop.
- The **Permanent ngrok Tunnel** binds to your reserved domain `https://amaretto-confess-subtract.ngrok-free.dev` every single time without changing URLs.
- The **Windows Scheduled Task** boots the whole system automatically whenever the PC turns on.

---

## 🚀 Quick Step-by-Step Setup

### Step 1: Copy the Project to the Lab PC
1. Copy the `lab_attendance_system` folder to the Lab PC (e.g. `C:\AI_LAB\lab_attendance_system` or `D:\AI LAB\lab_attendance_system`).

---

### Step 2: Run the One-Click Setup
1. Inside the `lab_attendance_system` folder, double-click:
   ```
   setup_lab_pc.bat
   ```
2. What it does automatically:
   - Verifies Python 3.10 / 3.11.
   - Creates a clean virtual environment (`venv\`).
   - Installs all dependencies from `requirements.txt`.
   - Initializes the SQLite database (`lab_attendance.db`) with tables & migrations.
   - Verifies ngrok CLI.

---

### Step 3: Configure ngrok Authtoken (One-Time)
If you haven't yet added your ngrok token on that PC:
1. Open `.env` inside `lab_attendance_system\` and paste your token:
   ```env
   NGROK_AUTHTOKEN=your_actual_token_here
   NGROK_DOMAIN=amaretto-confess-subtract.ngrok-free.dev
   ```
   *(Or run in PowerShell/CMD: `ngrok config add-authtoken YOUR_TOKEN`)*

---

### Step 4: Start the System (Manual Test)
Double-click:
```
run_24_7.bat
```
You will see:
- `[INFO] Starting Unified Backend (FastAPI + Camera Stream)...`
- `[SUCCESS] 24/7 PERMANENT TUNNEL ONLINE!`
- `>> Public URL: https://amaretto-confess-subtract.ngrok-free.dev`

Open on any phone or laptop:
👉 **`https://amaretto-confess-subtract.ngrok-free.dev`**

---

### Step 5: Enable 24/7 Auto-Start on PC Boot (Recommended)
To make sure the system starts automatically whenever the PC is switched on (even after power failure):
1. Right-click on **`install_startup_task.bat`**.
2. Select **"Run as administrator"**.
3. It registers a Windows boot task (`AILabAttendance24_7`) in Windows Task Scheduler.
4. Done! The lab PC will now maintain the camera and cloud portal 24/7.

---

## 🛠️ Features & Working

### 💼 1. "Project Working On Currently" Feature
- **When assigning a PC:** Choose an existing project or enter a research title (e.g., *YOLOv8 Edge AI*, *Large Language Model Fine-Tuning*, *Autonomous Vision*).
- **Live Display:** Each PC card shows the assigned student **and their active project**.
- **Real-Time Update:** Click on an occupied PC to update what the student is working on without ending their session.
- **Reporting:** Exported CSV logs include the student's name, roll number, time, and active project.

### 🌐 2. Permanent Domain
- Your domain `https://amaretto-confess-subtract.ngrok-free.dev` is configured as a static domain.
- The URL will **never change**, so faculty and students can bookmark it on their smartphones.

### 🔄 3. Auto-Healing & Watchdog
- `watchdog_24_7.py` pings the backend every 30 seconds.
- If the camera stream crashes or ngrok gets disconnected, it recycles the process within 10 seconds.
- All activities are logged to `logs/watchdog.log`, `logs/backend.log`, and `logs/ngrok.log`.

---

## ❓ Troubleshooting

| Issue | Solution |
|---|---|
| **Python not recognized** | Install Python 3.11 from python.org and check "Add Python to PATH" |
| **ngrok authtoken error** | Sign up free at ngrok.com and add token in `.env` |
| **Webcam not detected** | Ensure webcam is plugged into USB 3.0 port and not in use by another app |
| **Domain already bound error** | Close any other running ngrok terminal windows |
| **Remove auto-boot task** | Right-click `uninstall_startup_task.bat` and run as administrator |
