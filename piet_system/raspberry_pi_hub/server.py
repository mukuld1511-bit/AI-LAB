"""
server.py — FastAPI Hub Server for PIET AIML Dept. Smart Lab Supervision
========================================================================
Runs on Raspberry Pi 5 (or any central host) on port 8000.
Connects with:
- Windows Client Workstations (Lab 414, Lab 415, etc.) via LAN / Tailscale
- Teacher Mobile / Laptop Web Application
- Timetable Auto-Detection & Analytics Export
"""

import os
import sys
import base64
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

import database

# Initialize Database schema
database.init_db()

app = FastAPI(
    title="PIET AIML Department — Smart Lab Supervision System",
    description="Department-wide 5-Lab Windows Workstation Supervision & Fruitful Work Tracker",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
SCREENSHOTS_DIR = os.path.join(STATIC_DIR, "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)


# ── Pydantic Request Models ──

class HeartbeatPayload(BaseModel):
    pc_id: str
    lab_id: Optional[str] = "LAB-414"
    ip_address: Optional[str] = ""
    boot_time: Optional[str] = ""
    uptime_seconds: Optional[int] = 0
    active_work_seconds: Optional[int] = 0
    fruitful_seconds: Optional[int] = 0
    idle_seconds: Optional[int] = 0
    distracted_seconds: Optional[int] = 0
    cpu_percent: Optional[float] = 0.0
    ram_percent: Optional[float] = 0.0
    ram_used_gb: Optional[float] = 0.0
    ram_total_gb: Optional[float] = 0.0
    gpu_name: Optional[str] = ""
    gpu_percent: Optional[float] = 0.0
    gpu_temp: Optional[float] = 0.0
    active_window: Optional[str] = ""
    active_app: Optional[str] = ""
    activity_type: Optional[str] = "neutral"
    warning_reason: Optional[str] = ""
    top_processes: Optional[List[Dict[str, Any]]] = []


class CommandPayload(BaseModel):
    pc_id: str
    command: str  # e.g. 'capture_screen', 'kill:1234', 'warn:Focus on Lab'


class ScreenshotUploadPayload(BaseModel):
    pc_id: str
    image_base64: str


class TimetableEntryPayload(BaseModel):
    lab_id: str = "LAB-414"
    day_of_week: str
    start_time: str
    end_time: str
    subject: str
    faculty: str
    batch: str


# ── Health & Diagnostics ──

@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "status": "online",
        "system": "PIET AIML Department Smart Lab Supervision Hub",
        "version": "3.0.0",
        "active_lab": "LAB-414",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


# ── Central Local PC Forwarding & Relaying Configuration ──
import urllib.request
import json
import threading

MAIN_LOCAL_PC_URL = os.environ.get("MAIN_LOCAL_PC_URL", "https://labg418pc12.tailc8c1f6.ts.net").rstrip("/")

def relay_to_local_pc(endpoint: str, data: dict):
    """Asynchronously forwards telemetry to Central Local PC to protect SD card from write locks."""
    def _worker():
        try:
            url = f"{MAIN_LOCAL_PC_URL}{endpoint}"
            body = json.dumps(data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=body,
                headers={"Content-Type": "application/json", "User-Agent": "PIET-LabHub/3.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=4) as resp:
                pass
        except Exception:
            pass
    threading.Thread(target=_worker, daemon=True).start()


# ── Workstations Telemetry & Grid Endpoints ──

@app.post("/api/heartbeat")
def receive_heartbeat(payload: HeartbeatPayload):
    """Receives heartbeat from Lab Windows PCs, saves locally, and relays to Central Local PC."""
    data_dict = payload.dict()
    res = database.record_heartbeat(data_dict)
    # Asynchronously forward to Central Local PC for unified historical storage
    relay_to_local_pc("/api/heartbeat", data_dict)
    return res


@app.get("/api/labs")
def get_all_labs():
    """Lists all 5 AIML Department Labs."""
    return {"labs": database.get_all_labs()}


@app.get("/api/lab/{lab_id}/grid")
def get_lab_grid(lab_id: str):
    """Fetches real-time status of all workstations in a specific lab (e.g. LAB-414)."""
    grid_data = database.get_lab_workstations(lab_id=lab_id)
    slot_info = database.get_current_timetable_slot(lab_id=lab_id)
    grid_data["active_slot"] = slot_info
    return grid_data


# ── On-Demand Remote Commands & Screenshots ──

@app.post("/api/command")
def dispatch_command(payload: CommandPayload):
    """Teacher dispatches an on-demand command (e.g. 'capture_screen' or 'kill:pid')."""
    clean_pc = payload.pc_id.strip().upper()
    cmd = payload.command.strip()
    database.set_pending_command(clean_pc, cmd)
    return {"status": "ok", "pc_id": clean_pc, "command": cmd, "message": f"Dispatched '{cmd}' to {clean_pc}."}


@app.post("/api/screenshot")
def upload_screenshot(payload: ScreenshotUploadPayload):
    """Client workstation uploads on-demand screen capture. Relays to Central Local PC."""
    clean_pc = payload.pc_id.strip().upper()
    b64_data = payload.image_base64
    if "," in b64_data:
        b64_data = b64_data.split(",", 1)[1]

    try:
        raw_bytes = base64.b64decode(b64_data)
        out_filename = f"{clean_pc.lower()}.jpg"
        out_path = os.path.join(SCREENSHOTS_DIR, out_filename)
        with open(out_path, "wb") as f:
            f.write(raw_bytes)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        database.update_screenshot_timestamp(clean_pc, now_str)

        # Relay to Central Local PC
        relay_to_local_pc("/api/screenshot", {"pc_id": clean_pc, "image_base64": b64_data})

        return {
            "status": "ok",
            "pc_id": clean_pc,
            "url": f"/static/screenshots/{out_filename}?t={int(datetime.now().timestamp())}",
            "captured_at": now_str
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save screenshot: {e}")


# ── Timetable & 55-Minute Slot Logs Endpoints ──

@app.get("/api/timetable/{lab_id}")
def get_lab_timetable(lab_id: str):
    """Returns active slot and full weekly schedule for a lab based on 55-minute slots (09:05 - 16:25)."""
    active = database.get_current_timetable_slot(lab_id=lab_id)
    schedule = database.get_full_timetable(lab_id=lab_id)
    return {
        "lab_id": lab_id.upper(),
        "active_slot": active,
        "weekly_schedule": schedule
    }


@app.post("/api/logs/archive_slot")
def archive_slot_log(lab_id: Optional[str] = None, slot_name: Optional[str] = None):
    """Archives 55-minute lecture session logs into daily_session_logs."""
    count = database.archive_slot_session_logs(lab_id=lab_id, slot_name=slot_name)
    return {"status": "ok", "archived_pcs": count, "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")}


@app.get("/api/logs/daily_sessions")
def get_daily_logs_endpoint(lab_id: str = "LAB-414", date: Optional[str] = None):
    """Returns stored 55-minute slot session logs for NBA Criterion 4 audit."""
    logs = database.get_daily_session_logs(lab_id=lab_id, date_str=date)
    return {"status": "ok", "lab_id": lab_id.upper(), "date": date or datetime.now().strftime("%Y-%m-%d"), "logs": logs}


# ── Reports & Analytics (NBA Criterion 4 Compliant) ──

@app.get("/api/reports/daily")
def get_daily_report(lab_id: str = "LAB-414", date: Optional[str] = None):
    """Generates comprehensive daily departmental utilization & fruitful work report."""
    return database.generate_report(lab_id=lab_id, timeframe="daily", date_str=date)


@app.get("/api/reports/{timeframe}")
def get_utilization_report(timeframe: str, lab_id: str = "LAB-414", date: Optional[str] = None):
    """Generates official NBA Criterion 4 lab utilization report (daily, weekly, monthly, semester)."""
    return database.generate_report(lab_id=lab_id, timeframe=timeframe, date_str=date)


@app.get("/api/reports/export/csv")
@app.get("/api/reports_csv")
def export_report_csv_endpoint(timeframe: str = "daily", lab_id: str = "LAB-414"):
    """Downloads NBA Criterion 4 Lab Utilization Report as CSV."""
    from fastapi.responses import Response
    csv_content = database.export_report_csv(lab_id=lab_id, timeframe=timeframe)
    filename = f"PIET_{lab_id}_{timeframe}_utilization_report.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ── Static Web App & Asset Mounting ──

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static_assets")
app.mount("/screenshots", StaticFiles(directory=SCREENSHOTS_DIR), name="screenshots_assets")
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static_frontend")


if __name__ == "__main__":
    print("=" * 68)
    print("🚀 PIET AIML DEPARTMENT — SMART LAB SUPERVISION HUB (PORT 8000)")
    print("🖥️ Primary Lab : LAB-414 (AI & Deep Learning)")
    print("📱 Web Portal  : http://localhost:8000/ or http://<PI_IP>:8000/")
    print("=" * 68)
    uvicorn.run(app, host="0.0.0.0", port=8000)
