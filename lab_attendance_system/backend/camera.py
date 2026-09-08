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


def create_standby_frame(message="GATE CAMERA STANDBY"):
    """Generates an aesthetic standby canvas frame if camera is busy or initializing."""
    import numpy as np
    canvas = np.zeros((480, 640, 3), dtype=np.uint8)
    canvas[:] = (18, 24, 38) # Deep slate navy

    # Draw cyber grid lines
    for y in range(0, 480, 40):
        cv2.line(canvas, (0, y), (640, y), (30, 41, 59), 1)
    for x in range(0, 640, 40):
        cv2.line(canvas, (x, 0), (x, 480), (30, 41, 59), 1)

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cv2.putText(canvas, "AI/ML LAB GATE MONITORING SYSTEM", (40, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (99, 102, 241), 2)
    cv2.putText(canvas, f"STATUS: {message}", (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (239, 68, 68) if "OFFLINE" in message else (245, 158, 11), 2)
    cv2.putText(canvas, "Ensure USB webcam (Index 0) is connected", (40, 290), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (148, 163, 184), 1)
    cv2.putText(canvas, f"LIVE CLOCK: {now_str}", (40, 430), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 116, 139), 1)

    ret, buffer = cv2.imencode('.jpg', canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    return buffer.tobytes() if ret else b""


def generate_live_stream_frames():
    """
    Continuous generator for live gate camera feed with real-time face detection.
    - Green bounding box + name for enrolled members.
    - Red bounding box + 'INTRUDER / UNKNOWN' for unrecognized visitors.
    - Auto-captures unknown face snapshot into unknown_faces/ directory.
    """
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        standby = create_standby_frame("CAMERA OFFLINE / IN USE")
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + standby + b'\r\n')
        return

    # Set frame resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    last_detect_time = 0.0
    cached_face_locations = []
    cached_face_names = []
    last_unknown_logged_time = 0.0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                time.sleep(0.05)
                continue

            current_time = time.time()
            now_dt = datetime.now()
            today_str = now_dt.strftime("%Y-%m-%d")
            now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            # Run detection inference every ~0.4s to maintain 20+ FPS rendering
            if current_time - last_detect_time >= 0.4:
                last_detect_time = current_time
                # Downscale 50% for fast HOG detection
                small_frame = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
                rgb_small = cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                
                face_locs_small = face_recognition.face_locations(rgb_small, model="hog")
                # Scale locations back to 100%
                cached_face_locations = [(t * 2, r * 2, b * 2, l * 2) for (t, r, b, l) in face_locs_small]

                cached_face_names = []
                if len(face_locs_small) > 0:
                    known_dict = load_known_encodings()
                    known_names = list(known_dict.keys())
                    known_encodings = list(known_dict.values())

                    encodings = face_recognition.face_encodings(rgb_small, face_locs_small)
                    for idx, enc in enumerate(encodings):
                        matched_name = "UNKNOWN / INTRUDER"
                        if len(known_encodings) > 0:
                            matches = face_recognition.compare_faces(known_encodings, enc, tolerance=0.52)
                            if True in matches:
                                first_idx = matches.index(True)
                                matched_name = known_names[first_idx]

                        cached_face_names.append(matched_name)

                        # If unknown intruder detected, save snapshot with 8s cooldown
                        if matched_name == "UNKNOWN / INTRUDER" and (current_time - last_unknown_logged_time >= 8.0):
                            last_unknown_logged_time = current_time
                            top, right, bottom, left = cached_face_locations[idx]
                            h, w, _ = frame.shape
                            pad = 25
                            pad_top = max(0, top - pad)
                            pad_bottom = min(h, bottom + pad)
                            pad_left = max(0, left - pad)
                            pad_right = min(w, right + pad)
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

            # Draw annotations on current frame
            for (top, right, bottom, left), name in zip(cached_face_locations, cached_face_names):
                is_intruder = "UNKNOWN" in name
                box_color = (0, 0, 255) if is_intruder else (0, 255, 127) # Red vs Spring Green
                label_bg = (0, 0, 200) if is_intruder else (0, 160, 60)

                # Draw bounding box
                cv2.rectangle(frame, (left, top), (right, bottom), box_color, 2)

                # Draw label badge
                label_text = f" ! {name}" if is_intruder else f" OK {name}"
                (tw, th), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_DUPLEX, 0.6, 1)
                cv2.rectangle(frame, (left, top - 26), (left + tw + 10, top), label_bg, -1)
                cv2.putText(frame, label_text, (left + 5, top - 8), cv2.FONT_HERSHEY_DUPLEX, 0.55, (255, 255, 255), 1)

            # Draw Live Gate Overlay Header
            cv2.rectangle(frame, (0, 0), (640, 36), (15, 23, 42), -1)
            cv2.putText(frame, "LIVE GATE SECURITY CAM", (12, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)
            cv2.putText(frame, now_str, (460, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (148, 163, 184), 1)

            # Encode frame to JPEG
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ret:
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            time.sleep(0.04) # ~25 FPS

    finally:
        cap.release()

