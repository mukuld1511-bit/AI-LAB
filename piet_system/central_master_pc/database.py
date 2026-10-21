"""
database.py — Central Master Database Engine for PIET AIML Department
========================================================================
Runs on the Dedicated Central Department Master PC (High-Performance SSD).
Maintains:
- 5 AIML Department Labs (LAB-414 to LAB-418)
- 5 Raspberry Pi Edge Gateways (PI-414 to PI-418)
- 100 Workstations (20 PCs per lab)
- 55-Minute Official Timetable (09:05 - 16:25)
- Daily Session Archival Logs for NBA Criterion 4 Compliance
"""

import os
import sqlite3
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_FILE = os.path.join(DATA_DIR, "piet_department_master.db")
SCREENSHOTS_DIR = os.path.join(BASE_DIR, "static", "screenshots")
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

    # 1. Labs Directory
    c.execute("""
        CREATE TABLE IF NOT EXISTS labs (
            lab_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            total_pcs INTEGER DEFAULT 20,
            pi_gateway_id TEXT DEFAULT '',
            description TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1
        )
    """)

    # Seed Department Labs (24 PCs each)
    default_labs = [
        ("LAB-413", "Core AI & Programming Lab 413", 24, "PI-413", "Foundational Python, DSA & Core AI Programming Lab"),
        ("LAB-414", "AI & Deep Learning Lab 414", 24, "PI-414", "Primary High-Performance AI & Deep Learning Workstations"),
        ("LAB-415", "Machine Learning & Vision Lab 415", 24, "PI-415", "Computer Vision & Advanced Machine Learning Lab"),
        ("LAB-416", "Data Science & Analytics Lab 416", 24, "PI-416", "Big Data, Natural Language Processing & Analytics"),
        ("LAB-418", "Project & Research Lab 418", 24, "PI-418", "Capstone AI Projects, Research Sprint & Advanced Computing"),
        ("LAB-419", "Emerging Technologies & IoT Lab 419", 24, "PI-419", "Generative AI, Robotics & Edge Computing Lab")
    ]
    for lab in default_labs:
        c.execute("""
            INSERT OR REPLACE INTO labs (lab_id, name, total_pcs, pi_gateway_id, description)
            VALUES (?, ?, ?, ?, ?)
        """, lab)

    # 2. Raspberry Pi Edge Gateways Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS pi_gateways (
            gateway_id TEXT PRIMARY KEY,
            lab_id TEXT NOT NULL,
            ip_address TEXT DEFAULT '',
            is_online INTEGER DEFAULT 0,
            cpu_temp REAL DEFAULT 0.0,
            ram_percent REAL DEFAULT 0.0,
            uptime_seconds INTEGER DEFAULT 0,
            connected_pcs INTEGER DEFAULT 0,
            last_heartbeat TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
        )
    """)

    default_gateways = [
        ("PI-413", "LAB-413", "192.168.1.13", 0, "Lab 413 Edge Hub"),
        ("PI-414", "LAB-414", "100.126.217.27", 1, "Lab 414 Edge Hub (Pi 5)"),
        ("PI-415", "LAB-415", "192.168.1.15", 0, "Lab 415 Edge Hub (Pi 4/5)"),
        ("PI-416", "LAB-416", "192.168.1.16", 0, "Lab 416 Edge Hub (Pi 4/5)"),
        ("PI-418", "LAB-418", "192.168.1.18", 0, "Lab 418 Edge Hub (Pi 4/5)"),
        ("PI-419", "LAB-419", "192.168.1.19", 0, "Lab 419 Edge Hub (Pi 4/5)")
    ]
    for gw in default_gateways:
        c.execute("""
            INSERT OR REPLACE INTO pi_gateways (gateway_id, lab_id, ip_address, is_online, notes)
            VALUES (?, ?, ?, ?, ?)
        """, gw)

    # 3. Workstations Table (24 PCs per lab, Total 144 PCs)
    c.execute("""
        CREATE TABLE IF NOT EXISTS workstations (
            pc_id TEXT PRIMARY KEY,
            lab_id TEXT NOT NULL,
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
            relayed_via_pi TEXT DEFAULT '',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
        )
    """)

    # Seed 24 PC slots per lab (144 total)
    for lab_num in [413, 414, 415, 416, 418, 419]:
        lab_code = f"LAB-{lab_num}"
        for i in range(1, 25):
            p_id = f"PC-{lab_num}-{i:02d}"
            c.execute("""
                INSERT OR IGNORE INTO workstations (pc_id, lab_id, is_online, activity_type)
                VALUES (?, ?, 0, 'neutral')
            """, (p_id, lab_code))

    # 4. Official 55-Minute Timetable Table
    c.execute("""
        CREATE TABLE IF NOT EXISTS timetable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lab_id TEXT NOT NULL,
            day_of_week TEXT NOT NULL,
            period_code TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            subject TEXT NOT NULL,
            faculty TEXT NOT NULL,
            batch TEXT NOT NULL,
            FOREIGN KEY (lab_id) REFERENCES labs(lab_id)
        )
    """)

    # Seed Timetable if empty
    c.execute("SELECT COUNT(*) FROM timetable")
    if c.fetchone()[0] == 0:
        seed_official_55min_timetable(c)

    # 5. Daily Session Logs Table for NBA Criterion 4 Auditing
    c.execute("""
        CREATE TABLE IF NOT EXISTS daily_session_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_date TEXT NOT NULL,
            lab_id TEXT NOT NULL,
            slot_name TEXT NOT NULL,
            pc_id TEXT NOT NULL,
            uptime_seconds INTEGER DEFAULT 0,
            fruitful_seconds INTEGER DEFAULT 0,
            idle_seconds INTEGER DEFAULT 0,
            distracted_seconds INTEGER DEFAULT 0,
            fruitful_percent REAL DEFAULT 0.0,
            top_apps_used TEXT DEFAULT '',
            warning_count INTEGER DEFAULT 0,
            logged_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (lab_id) REFERENCES labs(lab_id),
            FOREIGN KEY (pc_id) REFERENCES workstations(pc_id)
        )
    """)

    conn.commit()
    conn.close()


def seed_official_55min_timetable(cursor: sqlite3.Cursor):
    """
    Seeds the official college academic schedule (09:05 - 16:25) with 55-minute slots:
    P1: 09:05 - 10:00
    P2: 10:00 - 10:55
    P3: 10:55 - 11:50
    P4: 11:50 - 12:45
    Recess: 12:45 - 13:40
    P5: 13:40 - 14:35
    P6: 14:35 - 15:30
    P7: 15:30 - 16:25
    """
    schedule_data = [
        # Monday
        ("LAB-414", "Monday", "P1-P2", "09:05", "10:55", "Deep Learning Lab (AIML-301)", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A1"),
        ("LAB-414", "Monday", "P3-P4", "10:55", "12:45", "Neural Networks & PyTorch Lab", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A2"),
        ("LAB-414", "Monday", "P5-P6", "13:40", "15:30", "Capstone Project Lab", "Faculty Mentor Panel", "4th Year AIML"),
        ("LAB-414", "Monday", "P7", "15:30", "16:25", "Research Seminar & AI Ethics", "Dr. Richa Choudhary, Assistant Professor", "4th Year AIML"),

        # Tuesday
        ("LAB-414", "Tuesday", "P1-P2", "09:05", "10:55", "Computer Vision Lab (AIML-302)", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A2"),
        ("LAB-414", "Tuesday", "P3-P4", "10:55", "12:45", "Deep Learning Studio", "Er. Gaurav Sharma", "3rd Year AIML - Batch A3"),
        ("LAB-414", "Tuesday", "P5-P6", "13:40", "15:30", "Generative AI & LLM Studio", "Dr. Amit Verma", "4th Year AIML"),
        ("LAB-414", "Tuesday", "P7", "15:30", "16:25", "Guided Practical Mentoring", "Dr. Richa Choudhary, Assistant Professor", "2nd Year AIML"),

        # Wednesday
        ("LAB-414", "Wednesday", "P1-P2", "09:05", "10:55", "Deep Learning Lab (AIML-301)", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A3"),
        ("LAB-414", "Wednesday", "P3-P4", "10:55", "12:45", "Machine Learning Lab (AIML-201)", "Er. Gaurav Sharma", "2nd Year AIML - Batch B1"),
        ("LAB-414", "Wednesday", "P5-P6", "13:40", "15:30", "Autonomous Systems Lab", "Er. Vikas Malik", "4th Year AIML"),
        ("LAB-414", "Wednesday", "P7", "15:30", "16:25", "Project Code Review & Sync", "Faculty Mentor Panel", "3rd Year AIML"),

        # Thursday
        ("LAB-414", "Thursday", "P1-P2", "09:05", "10:55", "Data Structures with Python", "Er. Priya Gupta", "2nd Year AIML - Batch B2"),
        ("LAB-414", "Thursday", "P3-P4", "10:55", "12:45", "Deep Learning Lab (AIML-301)", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A1"),
        ("LAB-414", "Thursday", "P5-P6", "13:40", "15:30", "Capstone AI Studio", "Dr. Richa Choudhary, Assistant Professor", "4th Year AIML"),
        ("LAB-414", "Thursday", "P7", "15:30", "16:25", "Technical Doubt & Skill Clinic", "Er. Gaurav Sharma", "2nd Year AIML"),

        # Friday
        ("LAB-414", "Friday", "P1-P2", "09:05", "10:55", "Advanced AI & GPU Computing", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - All Batches"),
        ("LAB-414", "Friday", "P3-P4", "10:55", "12:45", "Model Deployment & MLOps", "Er. Gaurav Sharma", "4th Year AIML"),
        ("LAB-414", "Friday", "P5-P6", "13:40", "15:30", "Hackathon & Research Sprint", "Faculty Mentor Panel", "3rd & 4th Year AIML"),
        ("LAB-414", "Friday", "P7", "15:30", "16:25", "Weekly Lab Audit & Handoff", "Dr. Richa Choudhary, Assistant Professor", "All Batches"),

        # Lab 415 Schedule
        ("LAB-415", "Monday", "P1-P2", "09:05", "10:55", "Computer Vision Lab", "Er. Gaurav Sharma", "3rd Year AIML - Batch B1"),
        ("LAB-415", "Monday", "P3-P4", "10:55", "12:45", "Pattern Recognition & Image Proc", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch B2"),
        ("LAB-415", "Wednesday", "P1-P2", "09:05", "10:55", "Robotics Vision Studio", "Er. Vikas Malik", "4th Year AIML"),

        # Lab 416 Schedule
        ("LAB-416", "Tuesday", "P1-P2", "09:05", "10:55", "Big Data Analytics Lab", "Dr. Amit Verma", "3rd Year AIML"),
        ("LAB-416", "Thursday", "P1-P2", "09:05", "10:55", "Natural Language Processing Lab", "Dr. Richa Choudhary, Assistant Professor", "3rd Year AIML - Batch A2"),

        # Lab 417 Schedule
        ("LAB-417", "Monday", "P1-P2", "09:05", "10:55", "Python for AI Foundations", "Er. Priya Gupta", "1st Year AIML"),
        ("LAB-417", "Wednesday", "P3-P4", "10:55", "12:45", "Object Oriented Programming in Python", "Er. Priya Gupta", "2nd Year AIML"),

        # Lab 418 Schedule (Project & Research Lab)
        ("LAB-418", "Monday", "P1-P2", "09:05", "10:55", "DGX High-Performance Computing Practicum", "Dr. Richa Choudhary, Assistant Professor", "4th Year AIML"),
        ("LAB-418", "Wednesday", "P5-P6", "13:40", "15:30", "Research Paper Implementation Sprint", "Dr. Richa Choudhary, Assistant Professor", "M.Tech & Capstone AIML"),
        ("LAB-418", "Friday", "P1-P2", "09:05", "10:55", "Autonomous Agents & LLM Fine-Tuning", "Dr. Richa Choudhary, Assistant Professor", "Research Scholars & 4th Year")
    ]

    for item in schedule_data:
        cursor.execute("""
            INSERT INTO timetable (lab_id, day_of_week, period_code, start_time, end_time, subject, faculty, batch)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, item)


# ── Relay / Workstation State Updates ──

def record_relayed_heartbeat(data: dict, pi_gateway_id: str = "") -> dict:
    """Updates workstation state forwarded by a Raspberry Pi edge gateway."""
    pc_id = data.get("pc_id", "").strip().upper()
    if not pc_id:
        return {"status": "error", "message": "Missing pc_id"}

    lab_id = data.get("lab_id", "")
    if not lab_id:
        if pc_id.startswith("PC-414"): lab_id = "LAB-414"
        elif pc_id.startswith("PC-415"): lab_id = "LAB-415"
        elif pc_id.startswith("PC-416"): lab_id = "LAB-416"
        elif pc_id.startswith("PC-417"): lab_id = "LAB-417"
        elif pc_id.startswith("PC-418"): lab_id = "LAB-418"
        else: lab_id = "LAB-414"

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        INSERT INTO workstations (
            pc_id, lab_id, ip_address, is_online, last_heartbeat, boot_time,
            uptime_seconds, active_work_seconds, fruitful_seconds, idle_seconds,
            distracted_seconds, cpu_percent, ram_percent, ram_used_gb, ram_total_gb,
            gpu_name, gpu_percent, gpu_temp, active_window, active_app, activity_type,
            top_processes, warning_reason, has_warning, relayed_via_pi, updated_at
        ) VALUES (
            ?, ?, ?, 1, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
        )
        ON CONFLICT(pc_id) DO UPDATE SET
            lab_id = excluded.lab_id,
            ip_address = COALESCE(NULLIF(excluded.ip_address, ''), workstations.ip_address),
            is_online = 1,
            last_heartbeat = excluded.last_heartbeat,
            boot_time = COALESCE(NULLIF(excluded.boot_time, ''), workstations.boot_time),
            uptime_seconds = excluded.uptime_seconds,
            active_work_seconds = excluded.active_work_seconds,
            fruitful_seconds = excluded.fruitful_seconds,
            idle_seconds = excluded.idle_seconds,
            distracted_seconds = excluded.distracted_seconds,
            cpu_percent = excluded.cpu_percent,
            ram_percent = excluded.ram_percent,
            ram_used_gb = excluded.ram_used_gb,
            ram_total_gb = excluded.ram_total_gb,
            gpu_name = COALESCE(NULLIF(excluded.gpu_name, ''), workstations.gpu_name),
            gpu_percent = excluded.gpu_percent,
            gpu_temp = excluded.gpu_temp,
            active_window = excluded.active_window,
            active_app = excluded.active_app,
            activity_type = excluded.activity_type,
            top_processes = excluded.top_processes,
            warning_reason = excluded.warning_reason,
            has_warning = CASE WHEN LENGTH(excluded.warning_reason) > 0 THEN 1 ELSE 0 END,
            relayed_via_pi = excluded.relayed_via_pi,
            updated_at = excluded.updated_at
    """, (
        pc_id, lab_id, data.get("ip_address", ""), now_str, data.get("boot_time", ""),
        data.get("uptime_seconds", 0), data.get("active_work_seconds", 0),
        data.get("fruitful_seconds", 0), data.get("idle_seconds", 0),
        data.get("distracted_seconds", 0), data.get("cpu_percent", 0.0),
        data.get("ram_percent", 0.0), data.get("ram_used_gb", 0.0),
        data.get("ram_total_gb", 0.0), data.get("gpu_name", ""),
        data.get("gpu_percent", 0.0), data.get("gpu_temp", 0.0),
        data.get("active_window", ""), data.get("active_app", ""),
        data.get("activity_type", "neutral"), json.dumps(data.get("top_processes", [])),
        data.get("warning_reason", ""), 1 if data.get("warning_reason") else 0,
        pi_gateway_id, now_str
    ))

    # Check for pending commands to return to the workstation (case-insensitive)
    clean_pc = pc_id.strip().upper()
    c.execute("SELECT pending_command FROM workstations WHERE UPPER(pc_id) = ?", (clean_pc,))
    row = c.fetchone()
    cmd = ""
    if row and row["pending_command"]:
        cmd = row["pending_command"]
        c.execute("UPDATE workstations SET pending_command = '' WHERE UPPER(pc_id) = ?", (clean_pc,))

    conn.commit()
    conn.close()

    return {"status": "ok", "pc_id": clean_pc, "command": cmd}


def record_pi_gateway_heartbeat(data: dict) -> dict:
    """Updates the live status of a Raspberry Pi edge gateway."""
    gw_id = data.get("gateway_id", "").strip().upper()
    if not gw_id:
        return {"status": "error", "message": "Missing gateway_id"}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_connection()
    c = conn.cursor()

    c.execute("""
        INSERT INTO pi_gateways (gateway_id, lab_id, ip_address, is_online, cpu_temp, ram_percent, uptime_seconds, connected_pcs, last_heartbeat, notes)
        VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(gateway_id) DO UPDATE SET
            ip_address = COALESCE(NULLIF(excluded.ip_address, ''), pi_gateways.ip_address),
            is_online = 1,
            cpu_temp = excluded.cpu_temp,
            ram_percent = excluded.ram_percent,
            uptime_seconds = excluded.uptime_seconds,
            connected_pcs = excluded.connected_pcs,
            last_heartbeat = excluded.last_heartbeat,
            notes = COALESCE(NULLIF(excluded.notes, ''), pi_gateways.notes)
    """, (
        gw_id, data.get("lab_id", "LAB-414"), data.get("ip_address", ""),
        data.get("cpu_temp", 0.0), data.get("ram_percent", 0.0),
        data.get("uptime_seconds", 0), data.get("connected_pcs", 0),
        now_str, data.get("notes", "")
    ))

    conn.commit()
    conn.close()
    return {"status": "ok", "gateway_id": gw_id}


# ── Queries for the Supervision Web Portal ──

def get_department_overview() -> dict:
    """Provides high-level department metrics across all 5 labs and 100 workstations."""
    conn = get_connection()
    c = conn.cursor()

    # Mark offline PCs (inactive > 45s)
    threshold = (datetime.now() - timedelta(seconds=45)).strftime("%Y-%m-%d %H:%M:%S")
    c.execute("UPDATE workstations SET is_online = 0 WHERE last_heartbeat < ? OR last_heartbeat IS NULL", (threshold,))
    c.execute("UPDATE pi_gateways SET is_online = 0 WHERE last_heartbeat < ? OR last_heartbeat IS NULL", (threshold,))
    conn.commit()

    # Workstation totals
    c.execute("""
        SELECT
            COUNT(*) as total_pcs,
            SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END) as online_pcs,
            SUM(CASE WHEN is_online = 1 AND activity_type = 'fruitful' THEN 1 ELSE 0 END) as fruitful_pcs,
            SUM(CASE WHEN is_online = 1 AND activity_type = 'idle' THEN 1 ELSE 0 END) as idle_pcs,
            SUM(CASE WHEN is_online = 1 AND activity_type = 'distracted' THEN 1 ELSE 0 END) as distracted_pcs,
            SUM(fruitful_seconds) as total_fruitful_sec
        FROM workstations
    """)
    totals = dict(c.fetchone())

    # Pi Gateways
    c.execute("SELECT * FROM pi_gateways ORDER BY gateway_id ASC")
    gateways = [dict(r) for r in c.fetchall()]

    # Lab summaries
    c.execute("""
        SELECT
            l.lab_id, l.name, l.total_pcs,
            SUM(CASE WHEN w.is_online = 1 THEN 1 ELSE 0 END) as online_pcs,
            SUM(CASE WHEN w.activity_type = 'fruitful' THEN 1 ELSE 0 END) as fruitful_pcs
        FROM labs l
        LEFT JOIN workstations w ON l.lab_id = w.lab_id
        GROUP BY l.lab_id
        ORDER BY l.lab_id ASC
    """)
    lab_summaries = [dict(r) for r in c.fetchall()]

    conn.close()
    return {
        "totals": totals,
        "gateways": gateways,
        "labs": lab_summaries,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }


def get_lab_grid(lab_id: str) -> dict:
    """Returns the 20-workstation grid data for a specific lab."""
    conn = get_connection()
    c = conn.cursor()

    # Active slot info
    slot_info = get_current_timetable_slot(lab_id)

    c.execute("SELECT * FROM workstations WHERE lab_id = ? ORDER BY pc_id ASC", (lab_id.upper(),))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    total = len(rows)
    online = sum(1 for r in rows if r["is_online"])
    fruitful = sum(1 for r in rows if r["activity_type"] == "fruitful")
    idle = sum(1 for r in rows if r["activity_type"] == "idle")
    distracted = sum(1 for r in rows if r["activity_type"] == "distracted")

    return {
        "lab_id": lab_id.upper(),
        "total_pcs": total,
        "online_count": online,
        "fruitful_count": fruitful,
        "idle_count": idle,
        "distracted_count": distracted,
        "active_slot": slot_info,
        "workstations": rows
    }


def get_current_timetable_slot(lab_id: str) -> Optional[dict]:
    """Finds current active 55-minute period for this lab."""
    now = datetime.now()
    day_name = now.strftime("%A")
    current_time = now.strftime("%H:%M")

    conn = get_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM timetable
        WHERE lab_id = ? AND day_of_week = ?
        AND start_time <= ? AND end_time > ?
        LIMIT 1
    """, (lab_id.upper(), day_name, current_time, current_time))
    row = c.fetchone()
    conn.close()

    if row:
        return dict(row)
    return None


def get_weekly_schedule(lab_id: str) -> List[dict]:
    """Returns weekly schedule for a lab."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM timetable WHERE lab_id = ? ORDER BY id ASC", (lab_id.upper(),))
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


# ── Archival Engine for 55-Minute Lecture Slots ──

def archive_slot_session_logs(lab_id: Optional[str] = None, slot_name: Optional[str] = None) -> int:
    """
    Archives active session metrics for all 20 PCs in the lab (or all 5 labs)
    into daily_session_logs on the Master PC's SSD.
    """
    conn = get_connection()
    c = conn.cursor()

    now = datetime.now()
    log_date = now.strftime("%Y-%m-%d")

    # Detect current period if not provided
    if not slot_name:
        cur_time = now.strftime("%H:%M")
        if "09:05" <= cur_time < "10:00": slot_name = "P1 (09:05 - 10:00)"
        elif "10:00" <= cur_time < "10:55": slot_name = "P2 (10:00 - 10:55)"
        elif "10:55" <= cur_time < "11:50": slot_name = "P3 (10:55 - 11:50)"
        elif "11:50" <= cur_time < "12:45": slot_name = "P4 (11:50 - 12:45)"
        elif "12:45" <= cur_time < "13:40": slot_name = "Recess (12:45 - 13:40)"
        elif "13:40" <= cur_time < "14:35": slot_name = "P5 (13:40 - 14:35)"
        elif "14:35" <= cur_time < "15:30": slot_name = "P6 (14:35 - 15:30)"
        elif "15:30" <= cur_time < "16:25": slot_name = "P7 (15:30 - 16:25)"
        else: slot_name = f"Session ({cur_time})"

    query = "SELECT * FROM workstations"
    params = []
    if lab_id and lab_id.upper() != "ALL":
        query += " WHERE lab_id = ?"
        params.append(lab_id.upper())

    c.execute(query, params)
    pcs = c.fetchall()

    archived_count = 0
    for pc in pcs:
        f_sec = pc["fruitful_seconds"] or 0
        u_sec = pc["uptime_seconds"] or 0
        f_pct = round((f_sec / u_sec * 100), 1) if u_sec > 0 else 0.0

        top_apps = pc["active_app"] if pc["active_app"] else "Standby"

        c.execute("""
            INSERT INTO daily_session_logs (
                log_date, lab_id, slot_name, pc_id, uptime_seconds,
                fruitful_seconds, idle_seconds, distracted_seconds,
                fruitful_percent, top_apps_used, warning_count, logged_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            log_date, pc["lab_id"], slot_name, pc["pc_id"],
            u_sec, f_sec, pc["idle_seconds"] or 0, pc["distracted_seconds"] or 0,
            f_pct, top_apps, pc["has_warning"] or 0,
            now.strftime("%Y-%m-%d %H:%M:%S")
        ))
        archived_count += 1

    conn.commit()
    conn.close()
    return archived_count


def get_daily_session_logs(lab_id: Optional[str] = None, date_str: Optional[str] = None) -> List[dict]:
    """Retrieves stored 55-minute period session logs."""
    conn = get_connection()
    c = conn.cursor()

    if not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    query = "SELECT * FROM daily_session_logs WHERE log_date = ?"
    params = [date_str]

    if lab_id and lab_id.upper() != "ALL":
        query += " AND lab_id = ?"
        params.append(lab_id.upper())

    query += " ORDER BY id DESC"
    c.execute(query, params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return rows


def set_pending_command(pc_id: str, command: str):
    """Queues a command for a workstation."""
    conn = get_connection()
    c = conn.cursor()
    clean_pc = pc_id.strip().upper()
    c.execute("UPDATE workstations SET pending_command = ? WHERE UPPER(pc_id) = ?", (command, clean_pc))
    conn.commit()
    conn.close()


def update_screenshot_timestamp(pc_id: str, ts: str):
    """Updates last screenshot timestamp."""
    conn = get_connection()
    c = conn.cursor()
    c.execute("UPDATE workstations SET last_screenshot_at = ? WHERE pc_id = ?", (ts, pc_id))
    conn.commit()
    conn.close()


def bulk_set_pending_command(lab_id: str, command: str) -> int:
    """Queues a power or control command for all workstations in a specific lab."""
    conn = get_connection()
    c = conn.cursor()
    if lab_id.upper() == "ALL":
        c.execute("UPDATE workstations SET pending_command = ?", (command,))
    else:
        c.execute("UPDATE workstations SET pending_command = ? WHERE lab_id = ?", (command, lab_id.upper()))
    count = c.rowcount
    conn.commit()
    conn.close()
    return count
