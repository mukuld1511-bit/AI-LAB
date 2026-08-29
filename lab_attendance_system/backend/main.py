import os
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database

app = FastAPI(
    title="AI/ML Lab Attendance & PC Occupancy System",
    description="Backend API for Richa Mam's AI Lab Attendance & PC Tracker",
    version="1.0.0"
)

# Enable CORS for local network and web dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root directory of lab attendance system
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNKNOWN_FACES_DIR = os.path.join(BASE_DIR, "unknown_faces")
os.makedirs(UNKNOWN_FACES_DIR, exist_ok=True)

# Mount unknown faces for static image access
app.mount("/unknown_faces_static", StaticFiles(directory=UNKNOWN_FACES_DIR), name="unknown_faces_static")


# Pydantic Request Models
class OccupyRequest(BaseModel):
    pc_id: str
    name: str


class FreeRequest(BaseModel):
    pc_id: str


@app.on_event("startup")
def startup_event():
    """Ensure database tables and initial PC status seed on startup."""
    database.init_db()


@app.get("/health")
def health_check():
    """Simple health check endpoint for connectivity testing."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/attendance/logs")
def get_attendance_logs(
    date: Optional[str] = Query(None, description="Format YYYY-MM-DD"),
    name: Optional[str] = Query(None, description="Filter by person's name")
) -> List[Dict[str, Any]]:
    """
    Returns all matching rows from attendance_logs as JSON list.
    Optional query params: date (YYYY-MM-DD), name
    """
    return database.get_attendance_logs(date=date, name=name)


@app.get("/pc/status")
def get_pc_status() -> List[Dict[str, Any]]:
    """
    Returns all 10 rows from pc_status as JSON list:
    (pc_id, status, occupied_by, since_time)
    """
    return database.get_all_pc_status()


@app.post("/pc/occupy")
def occupy_pc_endpoint(payload: OccupyRequest):
    """
    Request body: {"pc_id": "PC-3", "name": "Ayush"}
    UPDATE pc_status SET status='occupied', occupied_by=<name>, since_time=<now> WHERE pc_id=<pc_id>
    """
    pc_id = payload.pc_id.strip()
    name = payload.name.strip()

    if not pc_id:
        raise HTTPException(status_code=400, detail="pc_id is required.")
    if not name:
        raise HTTPException(status_code=400, detail="name is required to occupy a PC.")

    success = database.occupy_pc(pc_id=pc_id, name=name)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")

    return {
        "status": "success",
        "message": f"{pc_id} marked occupied by {name}",
        "pc_id": pc_id,
        "occupied_by": name
    }


@app.post("/pc/free")
def free_pc_endpoint(payload: FreeRequest):
    """
    Request body: {"pc_id": "PC-3"}
    UPDATE pc_status SET status='free', occupied_by=NULL, since_time=NULL WHERE pc_id=<pc_id>
    """
    pc_id = payload.pc_id.strip()
    if not pc_id:
        raise HTTPException(status_code=400, detail="pc_id is required.")

    success = database.free_pc(pc_id=pc_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"PC {pc_id} not found.")

    return {
        "status": "success",
        "message": f"{pc_id} marked as free",
        "pc_id": pc_id
    }


@app.get("/unknown_faces")
def get_unknown_faces() -> List[Dict[str, str]]:
    """
    Scans unknown_faces/ folder recursively, returns list of
    {image_path, url, date, timestamp, filename} for all saved images.
    The 'url' field is a path relative to the API root that can be used
    to fetch the image via the static mount.
    """
    images_list = []
    if not os.path.exists(UNKNOWN_FACES_DIR):
        return []

    for root, _, files in os.walk(UNKNOWN_FACES_DIR):
        for file in sorted(files, reverse=True):
            if file.lower().endswith((".jpg", ".jpeg", ".png")):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, BASE_DIR)
                # Build a URL-safe path relative to the UNKNOWN_FACES_DIR mount
                static_rel = os.path.relpath(full_path, UNKNOWN_FACES_DIR).replace("\\", "/")
                
                # Derive date and timestamp
                parent_dir = os.path.basename(root)
                # If the parent folder matches YYYY-MM-DD
                date_val = parent_dir if len(parent_dir) == 10 and parent_dir.count("-") == 2 else "Unknown"
                
                filename_no_ext = os.path.splitext(file)[0]
                # Format timestamp human-readable if file name is timestamp like 10-30-00
                timestamp_val = filename_no_ext.replace("_", " ").replace("-", ":")

                images_list.append({
                    "image_path": rel_path.replace("\\", "/"),
                    "url": f"/unknown_faces_static/{static_rel}",
                    "date": date_val,
                    "timestamp": timestamp_val,
                    "filename": file
                })

    return images_list


if __name__ == "__main__":
    import uvicorn
    # Bind with host="0.0.0.0" so it's reachable from other devices on WiFi
    uvicorn.run(app, host="0.0.0.0", port=8000)
