import cv2
import face_recognition
import pickle
import os
import time
import base64
from datetime import datetime
import database

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
ENCODINGS_FILE = os.path.join(PROJECT_ROOT, "face_recognition_module", "known_encodings.pkl")
UNKNOWN_FACES_ROOT = os.path.join(PROJECT_ROOT, "unknown_faces")

def load_known_encodings():
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    try:
        with open(ENCODINGS_FILE, "rb") as f:
            data = pickle.load(f)
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}

def capture_frame(retries=5):
    """Opens camera, captures a single frame, and closes camera."""
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        return None
        
    frame = None
    # Read a few frames to let the camera adjust exposure
    for _ in range(retries):
        ret, f = cap.read()
        if ret:
            frame = f
        time.sleep(0.1)
        
    cap.release()
    return frame

def scan_face_for_entry():
    """Captures a photo, recognizes face, logs IN, returns message."""
    database.init_db()
    frame = capture_frame(retries=10) # 1 second warmup
    if frame is None:
        return {"success": False, "message": "Failed to access camera."}
        
    now_dt = datetime.now()
    today_str = now_dt.strftime("%Y-%m-%d")
    now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")
    
    known_dict = load_known_encodings()
    known_names = list(known_dict.keys())
    known_encodings = list(known_dict.values())
    
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame, model="hog")
    
    if len(face_locations) == 0:
        return {"success": False, "message": "No face detected in camera view."}
        
    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    face_encoding = face_encodings[0]
    
    matched_name = None
    if len(known_encodings) > 0:
        matches = face_recognition.compare_faces(known_encodings, face_encoding, tolerance=0.55)
        if True in matches:
            first_match_index = matches.index(True)
            matched_name = known_names[first_match_index]
            
    if matched_name:
        # Check if already IN
        recent_log = database.get_latest_log_today(name=matched_name, today_date=today_str)
        if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
            return {"success": False, "message": f"{matched_name} is already logged IN!"}
            
        database.insert_attendance_log(name=matched_name, is_known=True, in_time=now_str, date=today_str, image_path=None)
        return {"success": True, "message": f"Welcome, {matched_name}! Logged IN."}
    else:
        # Save unknown face
        top, right, bottom, left = face_locations[0]
        h, w, _ = frame.shape
        pad_top = max(0, top - 20)
        pad_bottom = min(h, bottom + 20)
        pad_left = max(0, left - 20)
        pad_right = min(w, right + 20)
        face_crop = frame[pad_top:pad_bottom, pad_left:pad_right]

        date_folder = os.path.join(UNKNOWN_FACES_ROOT, today_str)
        os.makedirs(date_folder, exist_ok=True)
        timestamp_file = now_dt.strftime("%H-%M-%S")
        image_filename = f"{timestamp_file}.jpg"
        full_img_path = os.path.join(date_folder, image_filename)
        rel_img_path = os.path.relpath(full_img_path, PROJECT_ROOT).replace("\\", "/")
        cv2.imwrite(full_img_path, face_crop)

        counter = database.get_unknown_counter(today_date=today_str)
        unknown_label = f"Unknown_{counter}"

        database.insert_attendance_log(name=unknown_label, is_known=False, in_time=now_str, date=today_str, image_path=rel_img_path)
        return {"success": True, "message": f"Unrecognized face logged as {unknown_label}"}

def capture_face_photo():
    """Captures a frame and returns it as a base64 string for enrollment."""
    frame = capture_frame(retries=10)
    if frame is None:
        return {"success": False, "message": "Failed to access camera."}
        
    ret, buffer = cv2.imencode('.jpg', frame)
    if not ret:
        return {"success": False, "message": "Failed to encode image."}
        
    b64 = base64.b64encode(buffer).decode('utf-8')
    return {"success": True, "image_base64": f"data:image/jpeg;base64,{b64}"}
