"""
slot_logger_service.py — Autonomous 55-Minute Period Session Archiver
=====================================================================
Runs continuously in background on the Central Department Master PC.
Automatically snapshots and archives workstation utilization metrics
at the conclusion of each official college lecture period:
- Period 1: 10:00 AM
- Period 2: 10:55 AM
- Period 3: 11:50 AM
- Period 4: 12:45 PM
- Period 5: 02:35 PM (14:35)
- Period 6: 03:30 PM (15:30)
- Period 7: 04:25 PM (16:25)
"""

import time
import os
import threading
from datetime import datetime
import database

LOG_FILE = os.path.join(database.DATA_DIR, "slot_archiver.log")


def log_archiver(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] [SLOT-ARCHIVER] {msg}"
    print(formatted, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


SLOT_CHECKPOINTS = [
    ("10:00", "P1 (09:05 - 10:00)"),
    ("10:55", "P2 (10:00 - 10:55)"),
    ("11:50", "P3 (10:55 - 11:50)"),
    ("12:45", "P4 (11:50 - 12:45)"),
    ("13:40", "Recess (12:45 - 13:40)"),
    ("14:35", "P5 (13:40 - 14:35)"),
    ("15:30", "P6 (14:35 - 15:30)"),
    ("16:25", "P7 (15:30 - 16:25)")
]


def run_slot_archiver_loop():
    log_archiver("Slot Archival Service Initialized. Monitoring 55-minute college periods...")
    archived_today = set()
    current_date = datetime.now().strftime("%Y-%m-%d")

    while True:
        try:
            now = datetime.now()
            today_str = now.strftime("%Y-%m-%d")

            # Reset daily checkpoint tracking at midnight
            if today_str != current_date:
                current_date = today_str
                archived_today.clear()
                log_archiver(f"New academic day: {current_date}. Resetting period checkpoints.")

            cur_hm = now.strftime("%H:%M")

            for checkpoint_hm, slot_name in SLOT_CHECKPOINTS:
                key = f"{today_str}_{checkpoint_hm}"
                if cur_hm == checkpoint_hm and key not in archived_today:
                    log_archiver(f"Period conclusion reached at {cur_hm}. Archiving logs for '{slot_name}'...")
                    count = database.archive_slot_session_logs(lab_id="ALL", slot_name=slot_name)
                    archived_today.add(key)
                    log_archiver(f"Successfully archived session logs for {count} workstations in slot '{slot_name}'.")

        except Exception as e:
            log_archiver(f"Error during archival check: {e}")

        time.sleep(30)


def start_archiver_thread():
    """Starts the slot archiver in a daemon background thread."""
    t = threading.Thread(target=run_slot_archiver_loop, daemon=True, name="SlotArchiverThread")
    t.start()
    return t


if __name__ == "__main__":
    database.init_db()
    run_slot_archiver_loop()
