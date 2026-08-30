import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List, Dict, Any
import base64
import cv2
import numpy as np
import face_recognition
import pickle

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database
import camera

# Root directory of lab attendance system
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNKNOWN_FACES_DIR = os.path.join(BASE_DIR, "unknown_faces")
os.makedirs(UNKNOWN_FACES_DIR, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    database.init_db()
    yield


app = FastAPI(
    title="AI/ML Lab Attendance & PC Occupancy System",
    description="Backend API for Richa Mam's AI Lab Attendance & PC Tracker",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local network and web dashboards
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Remove old unknown faces mount since we'll serve it differently if needed, 
# or keep it as /unknown_faces_static
app.mount("/unknown_faces_static", StaticFiles(directory=UNKNOWN_FACES_DIR), name="unknown_faces_static")


# Pydantic Request Models
class OccupyRequest(BaseModel):
    pc_id: str
    name: str


class FreeRequest(BaseModel):
    pc_id: str


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

@app.post("/api/scan_entry")
def scan_entry():
    """Opens camera, scans face, and logs IN."""
    result = camera.scan_face_for_entry()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.get("/api/capture_photo")
def capture_photo():
    """Captures a photo from webcam for registration."""
    result = camera.capture_face_photo()
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@app.get("/api/registered_faces")
def get_registered_faces():
    """Returns a list of all enrolled known names."""
    known_data = camera.load_known_encodings()
    return {"faces": list(known_data.keys())}


class ManualAttendanceRequest(BaseModel):
    name: str
    action: str

@app.post("/api/manual_attendance")
def manual_attendance(payload: ManualAttendanceRequest):
    """Manually log IN or OUT for a person."""
    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    name = payload.name.strip()
    
    if payload.action.upper() == "IN":
        recent_log = database.get_latest_log_today(name=name, today_date=today_str)
        if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
            raise HTTPException(status_code=400, detail=f"'{name}' is already IN without an OUT time.")
        
        database.insert_attendance_log(
            name=name,
            is_known=True,
            in_time=now_str,
            date=today_str,
            image_path=None
        )
        return {"status": "success", "message": f"Manual IN logged for {name}"}
        
    elif payload.action.upper() == "OUT":
        recent_log = database.get_latest_log_today(name=name, today_date=today_str)
        if not recent_log or not recent_log.get("in_time"):
             raise HTTPException(status_code=400, detail=f"No IN record found for '{name}' today to mark OUT.")
        if recent_log.get("out_time"):
             raise HTTPException(status_code=400, detail=f"'{name}' is already marked OUT.")
             
        database.update_out_time(log_id=recent_log["id"], out_time=now_str)
        return {"status": "success", "message": f"Manual OUT logged for {name}"}
        
    raise HTTPException(status_code=400, detail="Invalid action. Must be IN or OUT.")


class EnrollRequest(BaseModel):
    name: str
    image_base64: str

@app.post("/enroll")
def enroll_face(payload: EnrollRequest):
    """Enroll a new face via base64 encoded image."""
    try:
        # Decode base64
        image_data = payload.image_base64
        if "," in image_data:
            image_data = image_data.split(",")[1]
            
        img_bytes = base64.b64decode(image_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        rgb_frame = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        face_locations = face_recognition.face_locations(rgb_frame, model="hog")
        if len(face_locations) == 0:
            raise HTTPException(status_code=400, detail="No face detected in the photo.")
        
        encodings = face_recognition.face_encodings(rgb_frame, face_locations)
        if len(encodings) == 0:
            raise HTTPException(status_code=400, detail="Could not extract face encoding.")
            
        new_encoding = encodings[0]
        
        # Save to known_encodings.pkl
        encodings_file = os.path.join(BASE_DIR, "face_recognition_module", "known_encodings.pkl")
        known_data = {}
        if os.path.exists(encodings_file):
            try:
                with open(encodings_file, "rb") as f:
                    known_data = pickle.load(f)
            except Exception:
                pass
                
        known_data[payload.name.strip()] = new_encoding
        with open(encodings_file, "wb") as f:
            pickle.dump(known_data, f)
            
        return {"status": "success", "message": f"Successfully registered '{payload.name}'"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/db/download")
def download_db():
    """Download the SQLite database."""
    db_path = os.path.join(BASE_DIR, "backend", "lab_attendance.db")
    if not os.path.exists(db_path):
        raise HTTPException(status_code=404, detail="Database not found.")
    return FileResponse(path=db_path, filename="lab_attendance.db")

@app.post("/db/clear")
def clear_db():
    """Clear all attendance logs (for admin)."""
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM attendance_logs")
        conn.commit()
        conn.close()
        return {"status": "success", "message": "All attendance logs cleared successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear database: {str(e)}")


# Mount the frontend at the root (must be placed AFTER all API routes)
app.mount("/", StaticFiles(directory=os.path.join(BASE_DIR, "backend", "static"), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Bind with host="0.0.0.0" so it's reachable from other devices on WiFi
    uvicorn.run(app, host="0.0.0.0", port=8000)
