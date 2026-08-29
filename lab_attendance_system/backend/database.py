import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lab_attendance.db")


def get_db_connection() -> sqlite3.Connection:
    """Returns a SQLite connection with row factory configured to return dict-like rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Creates tables if they do not exist and seeds initial PC status records (PC-1 to PC-10)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Table: attendance_logs
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            is_known BOOLEAN,
            image_path TEXT,
            in_time TEXT,
            out_time TEXT,
            date TEXT
        )
    """)

    # Table: pc_status
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pc_status (
            pc_id TEXT PRIMARY KEY,
            status TEXT,
            occupied_by TEXT,
            since_time TEXT
        )
    """)

    # Check if pc_status table is empty, seed PC-1 to PC-10 with status 'free'
    cursor.execute("SELECT COUNT(*) AS cnt FROM pc_status")
    row = cursor.fetchone()
    if row and row["cnt"] == 0:
        seed_pcs = [(f"PC-{i}", "free", None, None) for i in range(1, 11)]
        cursor.executemany(
            "INSERT INTO pc_status (pc_id, status, occupied_by, since_time) VALUES (?, ?, ?, ?)",
            seed_pcs
        )
        conn.commit()

    conn.commit()
    conn.close()


def get_all_pc_status() -> List[Dict[str, Any]]:
    """Fetch all PC status rows sorted by pc_id numerical order."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT pc_id, status, occupied_by, since_time FROM pc_status")
    rows = cursor.fetchall()
    conn.close()
    
    # Sort PC-1 through PC-10 in natural numerical order
    results = [dict(row) for row in rows]
    def sort_key(item):
        try:
            return int(item["pc_id"].replace("PC-", ""))
        except Exception:
            return 999
    results.sort(key=sort_key)
    return results


def occupy_pc(pc_id: str, name: str) -> bool:
    """Marks a PC as occupied by a given name with current timestamp."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE pc_status SET status = 'occupied', occupied_by = ?, since_time = ? WHERE pc_id = ?",
        (name, now_str, pc_id)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def free_pc(pc_id: str) -> bool:
    """Marks a PC as free and clears occupied_by and since_time."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE pc_status SET status = 'free', occupied_by = NULL, since_time = NULL WHERE pc_id = ?",
        (pc_id,)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def get_attendance_logs(date: Optional[str] = None, name: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch attendance logs with optional date and name filters."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT id, name, is_known, image_path, in_time, out_time, date FROM attendance_logs WHERE 1=1"
    params = []

    if date:
        query += " AND date = ?"
        params.append(date)

    if name:
        query += " AND name LIKE ?"
        params.append(f"%{name}%")

    query += " ORDER BY id DESC"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    conn.close()
    
    # Convert sqlite3.Row to list of dicts with boolean conversion for is_known
    results = []
    for r in rows:
        d = dict(r)
        d["is_known"] = bool(d["is_known"])
        results.append(d)
    return results


def get_latest_log_today(name: str, today_date: str) -> Optional[Dict[str, Any]]:
    """Fetch the most recent attendance log for a person today."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, is_known, image_path, in_time, out_time, date FROM attendance_logs WHERE name = ? AND date = ? ORDER BY id DESC LIMIT 1",
        (name, today_date)
    )
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["is_known"] = bool(d["is_known"])
        return d
    return None


def insert_attendance_log(name: str, is_known: bool, in_time: str, date: str, image_path: Optional[str] = None) -> int:
    """Inserts a new attendance log entry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO attendance_logs (name, is_known, image_path, in_time, out_time, date) VALUES (?, ?, ?, ?, NULL, ?)",
        (name, 1 if is_known else 0, image_path, in_time, date)
    )
    conn.commit()
    inserted_id = cursor.lastrowid
    conn.close()
    return inserted_id


def update_out_time(log_id: int, out_time: str) -> bool:
    """Updates the out_time of an existing attendance log entry."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE attendance_logs SET out_time = ? WHERE id = ?",
        (out_time, log_id)
    )
    conn.commit()
    affected = cursor.rowcount > 0
    conn.close()
    return affected


def get_unknown_counter(today_date: str) -> int:
    """Returns the next incrementing counter for unknown faces on a given date."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) AS cnt FROM attendance_logs WHERE is_known = 0 AND date = ?",
        (today_date,)
    )
    row = cursor.fetchone()
    conn.close()
    return (row["cnt"] if row else 0) + 1


# Auto-initialize on import/first run
init_db()
