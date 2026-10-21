"""
server.py — Central Master Server for PIET AIML Department Lab Supervision
=============================================================================
Runs on the Dedicated Department Master PC (Windows / Linux).
Central aggregator for:
- 5 Raspberry Pi Edge Hubs (Lab 414 to Lab 418)
- 100 Total Workstations (20 PCs per lab)
- 55-Minute Lecture Slots Archival & NBA Criterion 4 Reports
- Central Web Supervision Portal (PIET Institutional Green #008b38)
"""

import os
import sys
import json
import base64
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

import database
import slot_logger_service

# Load config
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
CONFIG = {}
if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            CONFIG = json.load(f)
    except Exception:
        pass

# Initialize database
database.init_db()

# Start background 55-minute period archiver
slot_logger_service.start_archiver_thread()

app = FastAPI(
    title="PIET AIML Department — Central Lab Supervision Master Server",
    description="Department-wide 5-Lab Workstation Telemetry, 55-Minute Lecture Slots & NBA Auditing Engine",
    version="3.2.0"
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


# ── Pydantic Models ──

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
    pi_gateway_id: Optional[str] = ""


class BatchHeartbeatPayload(BaseModel):
    gateway_id: str
    lab_id: str
    workstations: List[HeartbeatPayload]


class PiStatusPayload(BaseModel):
    gateway_id: str
    lab_id: str
    ip_address: Optional[str] = ""
    cpu_temp: Optional[float] = 0.0
    ram_percent: Optional[float] = 0.0
    uptime_seconds: Optional[int] = 0
    connected_pcs: Optional[int] = 0
    notes: Optional[str] = ""


class CommandPayload(BaseModel):
    pc_id: str
    command: str  # e.g. 'capture_screen', 'kill:1234', 'warn:Focus on Lab'


class ScreenshotUploadPayload(BaseModel):
    pc_id: str
    image_base64: str
    lab_id: Optional[str] = ""


# ── Health & Diagnostics ──

@app.get("/health")
@app.get("/api/health")
def health():
    return {
        "status": "online",
        "system": "PIET AIML Department Central Master Server",
        "version": "3.2.0",
        "total_labs": 5,
        "total_workstations": 100,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


# ── Raspberry Pi Relay Ingestion Endpoints ──

@app.post("/api/relay/heartbeat")
@app.post("/api/heartbeat")
def receive_relayed_heartbeat(payload: HeartbeatPayload):
    """Receives workstation heartbeat relayed by a Raspberry Pi edge hub."""
    res = database.record_relayed_heartbeat(payload.dict(), pi_gateway_id=payload.pi_gateway_id or "")
    return res


@app.post("/api/relay/batch_heartbeat")
def receive_batch_heartbeat(payload: BatchHeartbeatPayload):
    """Receives batch heartbeats for all 20 PCs from a Raspberry Pi in a single call."""
    gw_id = payload.gateway_id
    lab_id = payload.lab_id
    results = []
    for pc_payload in payload.workstations:
        d = pc_payload.dict()
        d["lab_id"] = lab_id
        res = database.record_relayed_heartbeat(d, pi_gateway_id=gw_id)
        results.append(res)
    return {"status": "ok", "gateway_id": gw_id, "processed": len(results)}


@app.post("/api/relay/pi_status")
def receive_pi_gateway_status(payload: PiStatusPayload):
    """Updates health status of a Raspberry Pi edge gateway."""
    res = database.record_pi_gateway_heartbeat(payload.dict())
    return res


@app.post("/api/relay/screenshot")
@app.post("/api/screenshot")
def receive_screenshot(payload: ScreenshotUploadPayload):
    """Saves on-demand workstation screenshot directly to Master PC SSD."""
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

        return {
            "status": "ok",
            "pc_id": clean_pc,
            "url": f"/static/screenshots/{out_filename}?t={int(datetime.now().timestamp())}",
            "captured_at": now_str
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save screenshot on Master SSD: {e}")


# ── Supervision Portal Endpoints ──

@app.get("/api/overview")
def get_overview():
    """Returns department overview (100 PCs, 5 Labs, 5 Pi Gateways)."""
    return database.get_department_overview()


@app.get("/api/lab/{lab_id}/grid")
def get_lab_grid(lab_id: str):
    """Returns the 20-workstation grid data for a specific lab (e.g. LAB-414)."""
    return database.get_lab_grid(lab_id=lab_id)


@app.get("/api/gateways")
def get_gateways():
    """Returns status of all 5 Raspberry Pi edge hubs."""
    conn = database.get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM pi_gateways ORDER BY gateway_id ASC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"gateways": rows}


@app.get("/api/timetable/{lab_id}")
def get_timetable(lab_id: str):
    """Returns 55-minute period timetable and active slot for a lab."""
    active = database.get_current_timetable_slot(lab_id)
    schedule = database.get_weekly_schedule(lab_id)
    return {"lab_id": lab_id.upper(), "active_slot": active, "weekly_schedule": schedule}


class LabPowerPayload(BaseModel):
    action: str  # 'shutdown', 'restart', 'lock'
    force: Optional[bool] = True


@app.post("/api/command")
def dispatch_command(payload: CommandPayload):
    """Teacher queues a command (e.g. 'capture_screen', 'shutdown', 'restart', 'lock', 'kill:pid')."""
    clean_pc = payload.pc_id.strip().upper()
    cmd = payload.command.strip()
    database.set_pending_command(clean_pc, cmd)
    return {"status": "ok", "pc_id": clean_pc, "command": cmd, "message": f"Queued '{cmd}' for {clean_pc}."}


@app.post("/api/lab/{lab_id}/power")
def bulk_lab_power(lab_id: str, payload: LabPowerPayload):
    """Dispatches remote power/update commands (shutdown/restart/lock/update) to all workstations in a lab."""
    action = payload.action.strip().lower()
    if action not in ("shutdown", "restart", "lock", "update"):
        raise HTTPException(status_code=400, detail="Action must be 'shutdown', 'restart', 'lock', or 'update'")
    count = database.bulk_set_pending_command(lab_id.upper(), action)
    return {
        "status": "ok",
        "lab_id": lab_id.upper(),
        "action": action,
        "affected_workstations": count,
        "message": f"Dispatched '{action}' command to {count} workstations in {lab_id.upper()}."
    }


@app.post("/api/lab/{lab_id}/update_all")
def bulk_lab_update(lab_id: str):
    """Queues remote self-update command to all workstations in a lab."""
    count = database.bulk_set_pending_command(lab_id.upper(), "update")
    return {
        "status": "ok",
        "lab_id": lab_id.upper(),
        "command": "update",
        "affected_workstations": count,
        "message": f"Dispatched silent auto-update to {count} workstations in {lab_id.upper()}."
    }



# ── Archival & Report Endpoints ──

@app.post("/api/logs/archive_slot")
def manual_archive_slot(lab_id: Optional[str] = "ALL", slot_name: Optional[str] = None):
    """Manually archives 55-minute lecture session logs into daily_session_logs."""
    count = database.archive_slot_session_logs(lab_id=lab_id, slot_name=slot_name)
    return {
        "status": "ok",
        "archived_pcs": count,
        "lab_id": lab_id or "ALL",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


@app.get("/api/logs/daily_sessions")
def get_daily_logs(lab_id: Optional[str] = "ALL", date: Optional[str] = None):
    """Returns stored 55-minute period session logs for NBA audits."""
    logs = database.get_daily_session_logs(lab_id=lab_id, date_str=date)
    return {
        "status": "ok",
        "lab_id": lab_id or "ALL",
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "total_records": len(logs),
        "logs": logs
    }


# ── Organized Lecture / Daily / Monthly Log Endpoints ──

@app.get("/api/logs/lecture")
def get_lecture_logs_endpoint(lab_id: Optional[str] = "ALL", date: Optional[str] = None):
    """Lecture-wise session records with subject, faculty, active PCs, attendance count, and fruitful %."""
    records = database.get_lecture_session_logs(lab_id=lab_id, date_str=date)
    return {
        "status": "ok",
        "lab_id": lab_id or "ALL",
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "total_records": len(records),
        "data": records
    }


@app.get("/api/logs/daily")
def get_daily_logs_endpoint(lab_id: Optional[str] = "ALL", start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Daily consolidated lab summaries across all periods."""
    records = database.get_daily_lab_logs(lab_id=lab_id)
    return {
        "status": "ok",
        "lab_id": lab_id or "ALL",
        "total_records": len(records),
        "data": records
    }


@app.get("/api/logs/monthly")
def get_monthly_logs_endpoint(lab_id: Optional[str] = "ALL", month: Optional[str] = None):
    """Monthly lab audit records for NBA Criterion 4."""
    records = database.get_monthly_lab_logs(lab_id=lab_id, month_str=month)
    return {
        "status": "ok",
        "lab_id": lab_id or "ALL",
        "month": month or datetime.now().strftime("%Y-%m"),
        "total_records": len(records),
        "data": records
    }


@app.get("/api/logs/students_monthly")
def get_students_monthly_endpoint(month: Optional[str] = None):
    """Student-wise monthly dossier tracking >=75% NBA eligibility threshold."""
    records = database.get_student_monthly_dossier(month_str=month)
    return {
        "status": "ok",
        "month": month or datetime.now().strftime("%Y-%m"),
        "total_students": len(records),
        "data": records
    }


@app.get("/api/logs/export_csv")
def export_organized_csv_endpoint(
    log_type: str = Query("lecture", description="lecture | daily | monthly | students"),
    lab_id: str = Query("ALL", description="ALL, LAB-413, LAB-414, LAB-415, LAB-416, LAB-418, LAB-419"),
    date_or_month: Optional[str] = None
):
    """Exports structured Lecture, Daily, Monthly, or Student records as an official CSV file."""
    csv_text = database.export_organized_logs_csv(log_type=log_type, lab_id=lab_id, date_or_month=date_or_month)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"PIET_Lab_{log_type.capitalize()}_Logs_{lab_id}_{ts}.csv"
    return Response(content=csv_text, media_type="text/csv", headers={
        "Content-Disposition": f"attachment; filename={filename}"
    })


# ── Mount Supervision Portal Static Files ──


if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="portal")


if __name__ == "__main__":
    port = CONFIG.get("port", 8080)
    host = CONFIG.get("host", "0.0.0.0")
    print(f"Starting PIET Department Central Master Server on http://{host}:{port}...")
    uvicorn.run("server:app", host=host, port=port, reload=False)
