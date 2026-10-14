"""
database.py — SQLite Engine for PIET AIML Dept. Lab Supervision System
======================================================================
High-performance, zero-concurrency-lock SQLite engine with WAL mode.
Manages:
- 5 Department Labs (Lab 414, Lab 415, Lab 416, Lab 417, Lab 418)
- PC Real-time Telemetry (Uptime, Fruitful Work, Idle, Distracted)
- Live On-Demand Screen Grabs
- Timetable Mapping & Active Slot Detection
- Daily & Slot-wise Analytics / Exportable Reports
"""

import os
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "piet_labs.db")
SCREENSHOTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def init_db():
    conn = get_connection()
    c = conn.cursor()

    # Table 1: Labs Directory (5 AIML Labs)
    c.execute("""
        CREATE TABLE IF NOT EXISTS labs (
            lab_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            total_pcs INTEGER DEFAULT 30,
            description TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1
        )
    """)

    # Seed Default 5 AIML Labs (20 PCs each)
    default_labs = [
        ("LAB-414", "AI & Deep Learning Lab 414", 20, "Primary Windows Lab — High Performance AI Workstations"),
        ("LAB-415", "Machine Learning & Vision Lab 415", 20, "Windows Workstations — Computer Vision & NLP"),
        ("LAB-416", "Data Science & Analytics Lab 416", 20, "Windows Workstations — Big Data & Analytics"),
        ("LAB-417", "Python & Core AI Lab 417", 20, "Windows Workstations — Algorithm & ML Labs"),
        ("LAB-418", "Project & Research Lab 418", 20, "Windows Workstations — Capstone Projects & DGX Terminal")
    ]
    for lab in default_labs:
        c.execute("""
            INSERT OR REPLACE INTO labs (lab_id, name, total_pcs, description)
            VALUES (?, ?, ?, ?)
        """, lab)

    # Table 2: Workstation Live States
    c.execute("""
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
            activity_type TEXT DEFAULT 'neutral', -- 'fruitful', 'idle', 'distracted', 'neutral'
            top_processes TEXT DEFAULT '[]',
            has_warning INTEGER DEFAULT 0,
            warning_reason TEXT DEFAULT '',
            last_screenshot_at TEXT DEFAULT '',
            pending_command TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
        )
    """)

    # Seed 20 PC slots for each lab (PC-414-01 to PC-414-20, etc.)
    for lab_num in [414, 415, 416, 417, 418]:
        lab_code = f"LAB-{lab_num}"
        for i in range(1, 21):
            p_id = f"PC-{lab_num}-{i:02d}"
            c.execute("""
                INSERT OR IGNORE INTO workstations (pc_id, lab_id, is_online, activity_type, active_window, active_app)
                VALUES (?, ?, 0, 'neutral', '', '')
            """, (p_id, lab_code))

    # Table 3: Daily Session Log Archives (For Historical Reports)
    c.execute("""
        CREATE TABLE IF NOT EXISTS daily_session_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL, -- YYYY-MM-DD
            lab_id TEXT NOT NULL,
            slot_name TEXT DEFAULT '', -- e.g. "09:00 - 11:00 (DL Lab)"
            pc_id TEXT NOT NULL,
            uptime_seconds INTEGER DEFAULT 0,
            fruitful_seconds INTEGER DEFAULT 0,
            idle_seconds INTEGER DEFAULT 0,
            distracted_seconds INTEGER DEFAULT 0,
            fruitful_percent REAL DEFAULT 0.0,
            top_apps_used TEXT DEFAULT '',
            warning_count INTEGER DEFAULT 0,
            logged_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table 4: Timetable (Day, Slot, Subject, Faculty, Batch)
    c.execute("""
        CREATE TABLE IF NOT EXISTS timetable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lab_id TEXT NOT NULL DEFAULT 'LAB-414',
            day_of_week TEXT NOT NULL, -- Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
            start_time TEXT NOT NULL, -- HH:MM (24-hour)
            end_time TEXT NOT NULL,   -- HH:MM (24-hour)
            subject TEXT NOT NULL,
            faculty TEXT NOT NULL,
            batch TEXT NOT NULL
        )
    """)

    # Seed Default Sample Schedule for Lab 414
    sample_slots = [
        ("LAB-414", "Monday", "09:00", "11:00", "Deep Learning Lab (AIML-301)", "Prof. Richa Choudhary", "3rd Year AIML - Batch A1"),
        ("LAB-414", "Monday", "11:30", "01:30", "Machine Learning Lab (AIML-201)", "Er. Gaurav Sharma", "2nd Year AIML - Batch B1"),
        ("LAB-414", "Monday", "02:00", "04:00", "Capstone Project Lab", "Faculty Mentor Panel", "4th Year AIML"),
        ("LAB-414", "Tuesday", "09:00", "11:00", "Computer Vision Lab (AIML-302)", "Prof. Richa Choudhary", "3rd Year AIML - Batch A2"),
        ("LAB-414", "Tuesday", "11:30", "01:30", "NLP & LLM Studio (AIML-401)", "Dr. Amit Verma", "4th Year AIML"),
        ("LAB-414", "Wednesday", "09:00", "11:00", "Deep Learning Lab (AIML-301)", "Prof. Richa Choudhary", "3rd Year AIML - Batch A3"),
        ("LAB-414", "Thursday", "09:00", "11:00", "Data Structures with Python", "Er. Priya Gupta", "2nd Year AIML - Batch B2"),
        ("LAB-414", "Friday", "09:00", "11:00", "Advanced AI Lab", "Prof. Richa Choudhary", "3rd Year AIML - All Batches")
    ]
    c.execute("SELECT count(*) as cnt FROM timetable")
    if c.fetchone()["cnt"] == 0:
        c.executemany("""
            INSERT INTO timetable (lab_id, day_of_week, start_time, end_time, subject, faculty, batch)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, sample_slots)

    conn.commit()
    conn.close()


def record_heartbeat(data: Dict[str, Any]) -> Dict[str, Any]:
    """Records a live heartbeat from a lab workstation."""
    conn = get_connection()
    c = conn.cursor()
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    pc_id = (data.get("pc_id") or "PC-414-UNKNOWN").upper().strip()
    lab_id = (data.get("lab_id") or "LAB-414").upper().strip()

    # Calculate Warning Status based on activity type & rules
    act_type = (data.get("activity_type") or "neutral").lower()
    has_warning = 1 if act_type == "distracted" else 0
    warn_reason = data.get("warning_reason", "") if has_warning else ""

    procs_json = json.dumps(data.get("top_processes", []))

    c.execute("""
        INSERT INTO workstations (
            pc_id, lab_id, ip_address, is_online, last_heartbeat, boot_time,
            uptime_seconds, active_work_seconds, fruitful_seconds, idle_seconds,
            distracted_seconds, cpu_percent, ram_percent, ram_used_gb, ram_total_gb,
            gpu_name, gpu_percent, gpu_temp, active_window, active_app,
            activity_type, top_processes, has_warning, warning_reason, updated_at
        ) VALUES (
            ?, ?, ?, 1, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
        )
        ON CONFLICT(pc_id) DO UPDATE SET
            lab_id = excluded.lab_id,
            ip_address = excluded.ip_address,
            is_online = 1,
            last_heartbeat = excluded.last_heartbeat,
            boot_time = excluded.boot_time,
            uptime_seconds = excluded.uptime_seconds,
            active_work_seconds = excluded.active_work_seconds,
            fruitful_seconds = excluded.fruitful_seconds,
            idle_seconds = excluded.idle_seconds,
            distracted_seconds = excluded.distracted_seconds,
            cpu_percent = excluded.cpu_percent,
            ram_percent = excluded.ram_percent,
            ram_used_gb = excluded.ram_used_gb,
            ram_total_gb = excluded.ram_total_gb,
            gpu_name = excluded.gpu_name,
            gpu_percent = excluded.gpu_percent,
            gpu_temp = excluded.gpu_temp,
            active_window = excluded.active_window,
            active_app = excluded.active_app,
            activity_type = excluded.activity_type,
            top_processes = excluded.top_processes,
            has_warning = excluded.has_warning,
            warning_reason = excluded.warning_reason,
            updated_at = excluded.updated_at
    """, (
        pc_id, lab_id, data.get("ip_address", ""), now_str, data.get("boot_time", ""),
        data.get("uptime_seconds", 0), data.get("active_work_seconds", 0),
        data.get("fruitful_seconds", 0), data.get("idle_seconds", 0),
        data.get("distracted_seconds", 0), data.get("cpu_percent", 0.0),
        data.get("ram_percent", 0.0), data.get("ram_used_gb", 0.0), data.get("ram_total_gb", 0.0),
        data.get("gpu_name", ""), data.get("gpu_percent", 0.0), data.get("gpu_temp", 0.0),
        data.get("active_window", ""), data.get("active_app", ""),
        act_type, procs_json, has_warning, warn_reason, now_str
    ))

    # Retrieve and consume any pending commands (e.g. 'capture_screen' or 'kill:pid')
    c.execute("SELECT pending_command FROM workstations WHERE pc_id = ?", (pc_id,))
    row = c.fetchone()
    cmd = row["pending_command"] if row and row["pending_command"] else None

    if cmd:
        c.execute("UPDATE workstations SET pending_command = '' WHERE pc_id = ?", (pc_id,))

    conn.commit()
    conn.close()

    return {"status": "ok", "command": cmd}


def get_lab_workstations(lab_id: str = "LAB-414") -> Dict[str, Any]:
    """Returns grid of workstations for a specific lab with fruitful metrics."""
    conn = get_connection()
    c = conn.cursor()

    # Auto-mark PCs as offline if no heartbeat in last 90 seconds
    cutoff = (datetime.now() - timedelta(seconds=90)).strftime("%Y-%m-%d %H:%M:%S")
    c.execute("UPDATE workstations SET is_online = 0 WHERE is_online = 1 AND last_heartbeat < ?", (cutoff,))
    conn.commit()

    c.execute("""
        SELECT * FROM workstations 
        WHERE lab_id = ? 
        ORDER BY pc_id ASC
    """, (lab_id.upper(),))
    rows = [dict(r) for r in c.fetchall()]

    for r in rows:
        try:
            r["top_processes"] = json.loads(r.get("top_processes") or "[]")
        except Exception:
            r["top_processes"] = []

        # Calculate fruitful percentage
        total_time = (r.get("fruitful_seconds", 0) + r.get("idle_seconds", 0) + r.get("distracted_seconds", 0)) or 1
        r["fruitful_ratio"] = round((r.get("fruitful_seconds", 0) / total_time) * 100, 1)

        # Attach image URL if screenshot exists
        img_file = f"{r['pc_id'].lower()}.jpg"
        full_p = os.path.join(SCREENSHOTS_DIR, img_file)
        if os.path.exists(full_p):
            r["screenshot_url"] = f"/screenshots/{img_file}?t={int(os.path.getmtime(full_p))}"
        else:
            r["screenshot_url"] = None

    # Summary statistics for the lab
    total = len(rows)
    online_count = sum(1 for r in rows if r["is_online"])
    fruitful_count = sum(1 for r in rows if r["is_online"] and r["activity_type"] == "fruitful")
    idle_count = sum(1 for r in rows if r["is_online"] and r["activity_type"] == "idle")
    warning_count = sum(1 for r in rows if r["is_online"] and r["has_warning"])

    conn.close()
    return {
        "lab_id": lab_id.upper(),
        "total_pcs": total,
        "online_count": online_count,
        "fruitful_count": fruitful_count,
        "idle_count": idle_count,
        "warning_count": warning_count,
        "pcs": rows
    }


def get_all_labs() -> List[Dict[str, Any]]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM labs WHERE is_active = 1 ORDER BY lab_id ASC")
    labs = [dict(r) for r in c.fetchall()]
    conn.close()
    return labs


def set_pending_command(pc_id: str, cmd: str) -> bool:
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE workstations SET pending_command = ? WHERE pc_id = ?", (cmd, pc_id.upper()))
    conn.commit()
    conn.close()
    return True


def update_screenshot_timestamp(pc_id: str, timestamp_str: str):
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE workstations SET last_screenshot_at = ? WHERE pc_id = ?", (timestamp_str, pc_id.upper()))
    conn.commit()
    conn.close()


def get_current_timetable_slot(lab_id: str = "LAB-414") -> Optional[Dict[str, Any]]:
    """Detects what lecture/lab session is active right now based on day and time."""
    conn = get_connection()
    c = conn.cursor()

    now = datetime.now()
    day_name = now.strftime("%A")  # e.g. "Monday"
    cur_time = now.strftime("%H:%M")  # e.g. "10:15"

    c.execute("""
        SELECT * FROM timetable 
        WHERE lab_id = ? AND day_of_week = ? 
        AND start_time <= ? AND end_time >= ?
        LIMIT 1
    """, (lab_id.upper(), day_name, cur_time, cur_time))

    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_full_timetable(lab_id: str = "LAB-414") -> List[Dict[str, Any]]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM timetable 
        WHERE lab_id = ? 
        ORDER BY 
            CASE day_of_week
                WHEN 'Monday' THEN 1
                WHEN 'Tuesday' THEN 2
                WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4
                WHEN 'Friday' THEN 5
                WHEN 'Saturday' THEN 6
                ELSE 7
            END,
            start_time ASC
    """, (lab_id.upper(),))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def generate_daily_report(lab_id: str = "LAB-414", date_str: Optional[str] = None) -> Dict[str, Any]:
    """Generates comprehensive daily utilization & fruitful work report for department records."""
    conn = get_connection()
    c = conn.cursor()

    target_date = date_str or datetime.now().strftime("%Y-%m-%d")

    # Fetch current state of PCs in this lab
    c.execute("SELECT * FROM workstations WHERE lab_id = ? ORDER BY pc_id ASC", (lab_id.upper(),))
    pcs = [dict(r) for r in c.fetchall()]

    total_pcs = len(pcs)
    total_uptime_secs = sum(p.get("uptime_seconds", 0) for p in pcs)
    total_fruitful_secs = sum(p.get("fruitful_seconds", 0) for p in pcs)
    total_idle_secs = sum(p.get("idle_seconds", 0) for p in pcs)
    total_distracted_secs = sum(p.get("distracted_seconds", 0) for p in pcs)

    total_activity = (total_fruitful_secs + total_idle_secs + total_distracted_secs) or 1
    fruitful_rate = round((total_fruitful_secs / total_activity) * 100, 1)

    pc_summaries = []
    for p in pcs:
        t_secs = (p.get("fruitful_seconds", 0) + p.get("idle_seconds", 0) + p.get("distracted_seconds", 0)) or 1
        rate = round((p.get("fruitful_seconds", 0) / t_secs) * 100, 1)
        pc_summaries.append({
            "pc_id": p["pc_id"],
            "uptime": format_duration(p.get("uptime_seconds", 0)),
            "fruitful_time": format_duration(p.get("fruitful_seconds", 0)),
            "idle_time": format_duration(p.get("idle_seconds", 0)),
            "distracted_time": format_duration(p.get("distracted_seconds", 0)),
            "fruitful_percent": f"{rate}%",
            "last_active_app": p.get("active_app") or "N/A",
            "has_warning": bool(p.get("has_warning")),
            "warning_reason": p.get("warning_reason") or "None"
        })

    conn.close()

    return {
        "report_date": target_date,
        "lab_id": lab_id.upper(),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "total_workstations": total_pcs,
        "total_uptime": format_duration(total_uptime_secs),
        "total_fruitful_work": format_duration(total_fruitful_secs),
        "overall_fruitful_rate": f"{fruitful_rate}%",
        "total_idle_time": format_duration(total_idle_secs),
        "pcs": pc_summaries
    }


def format_duration(seconds: int) -> str:
    if seconds <= 0:
        return "0m"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"
