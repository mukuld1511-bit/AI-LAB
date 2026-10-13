import cv2
import numpy as np
import face_recognition
import pickle
import os
import sys
import time
from datetime import datetime

# Setup paths
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
ENCODINGS_FILE = os.path.join(CURRENT_DIR, "known_encodings.pkl")
UNKNOWN_FACES_ROOT = os.path.join(PROJECT_ROOT, "unknown_faces")
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

# Import database module from backend
sys.path.insert(0, BACKEND_DIR)
import database

_RECOG_CACHE = {}
_RECOG_MTIME = 0.0

def load_known_encodings():
    """Loads known faces dictionary {name: encoding} from pickle file with mtime caching."""
    global _RECOG_CACHE, _RECOG_MTIME
    if not os.path.exists(ENCODINGS_FILE):
        return {}
    try:
        mtime = os.path.getmtime(ENCODINGS_FILE)
        if mtime != _RECOG_MTIME or not _RECOG_CACHE:
            with open(ENCODINGS_FILE, "rb") as f:
                data = pickle.load(f)
                if isinstance(data, dict):
                    _RECOG_CACHE = data
                    _RECOG_MTIME = mtime
        return _RECOG_CACHE
    except Exception as e:
        print(f"[WARNING] Could not load {ENCODINGS_FILE}: {e}")
        return _RECOG_CACHE or {}


def main():
    print("=" * 65)
    print("    AI/ML LAB - REAL-TIME FACE RECOGNITION ATTENDANCE SYSTEM")
    print("    Hardware Mode: CPU-Only (HOG Model) | 2.0s Interval Throttling")
    print("=" * 65)

    # Initialize database
    database.init_db()

    # Open webcam index 0
    print("[INFO] Initializing USB Webcam (Index 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[FATAL] Unable to access camera at index 0. Ensure no other app is using it.")
        sys.exit(1)

    print("[INFO] Camera initialized successfully. Press 'q' in video window to exit.")
    
    last_process_time = 0.0
    PROCESS_INTERVAL = 2.0  # seconds between face recognition runs to conserve CPU
    
    # Cooldown dictionary to avoid duplicate spam on consecutive frames for the same person
    # (e.g. don't log IN then immediately log OUT 2 seconds later while person is still standing at door)
    last_logged_time = {}
    EVENT_COOLDOWN = 10.0  # seconds cooldown before logging same person again
    
    session_unknowns = {}  # Tracks unknowns for this session: {name: encoding}
    last_face_locations = []
    last_face_names = []
    last_face_colors = []

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Camera frame capture failed. Retrying...")
            time.sleep(0.5)
            continue

        current_time = time.time()

        # Run detection only once every ~2 seconds
        if current_time - last_process_time >= PROCESS_INTERVAL:
            last_process_time = current_time
            now_dt = datetime.now()
            today_str = now_dt.strftime("%Y-%m-%d")
            now_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

            # Load fresh known encodings (in case new faces were enrolled)
            known_dict = load_known_encodings()
            known_names = list(known_dict.keys())
            known_encodings = list(known_dict.values())

            # Combine knowns and session unknowns for matching
            all_known_names = list(known_names) + list(session_unknowns.keys())
            all_known_encodings = list(known_encodings) + list(session_unknowns.values())

            # High-performance 0.25x downscaling (16x faster than full resolution HOG)
            small_frame = cv2.resize(frame, (0, 0), fx=0.25, fy=0.25)
            rgb_small = np.ascontiguousarray(small_frame[:, :, ::-1])

            # Detect faces using CPU-based HOG model on downscaled frame
            face_locations_small = face_recognition.face_locations(rgb_small, model="hog")
            
            new_face_locations = []
            new_face_names = []
            new_face_colors = []

            if len(face_locations_small) > 0:
                face_locations = [(t * 4, r * 4, b * 4, l * 4) for (t, r, b, l) in face_locations_small]
                face_encodings = face_recognition.face_encodings(rgb_small, face_locations_small)

                for (top, right, bottom, left), face_encoding in zip(face_locations, face_encodings):
                    matched_name = None

                    if len(all_known_encodings) > 0:
                        matches = face_recognition.compare_faces(all_known_encodings, face_encoding, tolerance=0.55)
                        if True in matches:
                            first_match_index = matches.index(True)
                            matched_name = all_known_names[first_match_index]

                    if matched_name is not None:
                        is_known_person = matched_name in known_dict
                        # Known person or previously seen unknown matched
                        # Check cooldown
                        last_time = last_logged_time.get(matched_name, 0)
                        if (current_time - last_time) >= EVENT_COOLDOWN:
                            last_logged_time[matched_name] = current_time

                            # Check attendance_logs for that name's most recent row for today's date
                            recent_log = database.get_latest_log_today(name=matched_name, today_date=today_str)

                            if recent_log and recent_log.get("in_time") and not recent_log.get("out_time"):
                                # UPDATE that row, set out_time = now
                                database.update_out_time(log_id=recent_log["id"], out_time=now_str)
                                print(f"[{now_str}] MATCH: {matched_name} | Action: OUT | Status: Out-time logged ({now_str})")
                            else:
                                # INSERT new row with name, is_known=True, in_time=now, date=today
                                database.insert_attendance_log(
                                    name=matched_name,
                                    is_known=is_known_person,
                                    in_time=now_str,
                                    date=today_str,
                                    image_path=None
                                )
                                print(f"[{now_str}] MATCH: {matched_name} | Action: IN  | Status: In-time logged ({now_str})")
                        
                        new_face_locations.append((top, right, bottom, left))
                        new_face_names.append(matched_name)
                        new_face_colors.append((0, 255, 0) if is_known_person else (0, 0, 255))

                    else:
                        # Completely new unknown person
                        # Crop face region with small safety padding
                        h, w, _ = frame.shape
                        pad_top = max(0, top - 20)
                        pad_bottom = min(h, bottom + 20)
                        pad_left = max(0, left - 20)
                        pad_right = min(w, right + 20)
                        face_crop = frame[pad_top:pad_bottom, pad_left:pad_right]

                        # Ensure date folder exists: unknown_faces/YYYY-MM-DD/
                        date_folder = os.path.join(UNKNOWN_FACES_ROOT, today_str)
                        os.makedirs(date_folder, exist_ok=True)

                        # Save cropped face image
                        timestamp_file = now_dt.strftime("%H-%M-%S")
                        image_filename = f"{timestamp_file}.jpg"
                        full_img_path = os.path.join(date_folder, image_filename)
                        rel_img_path = os.path.relpath(full_img_path, PROJECT_ROOT).replace("\\", "/")
                        
                        cv2.imwrite(full_img_path, face_crop)

                        # Incrementing counter for today's unknown faces
                        counter = database.get_unknown_counter(today_date=today_str)
                        unknown_label = f"Unknown_{counter}"
                        
                        # Track in session to avoid duplicate snapshots
                        session_unknowns[unknown_label] = face_encoding
                        last_logged_time[unknown_label] = current_time

                        # INSERT new row: name="Unknown_<incrementing number>", is_known=False, image_path=<saved path>, in_time=now, date=today
                        database.insert_attendance_log(
                            name=unknown_label,
                            is_known=False,
                            in_time=now_str,
                            date=today_str,
                            image_path=rel_img_path
                        )
                        print(f"[{now_str}] UNKNOWN FACE DETECTED | Action: IN  | Name: {unknown_label} | Image: {rel_img_path}")
                        
                        new_face_locations.append((top, right, bottom, left))
                        new_face_names.append(unknown_label)
                        new_face_colors.append((0, 0, 255))
                        
            last_face_locations = new_face_locations
            last_face_names = new_face_names
            last_face_colors = new_face_colors

        # Visual preview with bounding boxes for monitoring
        display_frame = frame.copy()
        
        # Draw bounding boxes
        for (top, right, bottom, left), name, color in zip(last_face_locations, last_face_names, last_face_colors):
            cv2.rectangle(display_frame, (left, top), (right, bottom), color, 2)
            cv2.rectangle(display_frame, (left, bottom - 35), (right, bottom), color, cv2.FILLED)
            cv2.putText(display_frame, name, (left + 6, bottom - 6), cv2.FONT_HERSHEY_DUPLEX, 0.6, (255, 255, 255), 1)

        cv2.putText(
            display_frame,
            "AI Lab Attendance Camera (Active - 2s Cycle)",
            (15, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 200, 0),
            2
        )
        cv2.putText(
            display_frame,
            f"Time: {datetime.now().strftime('%H:%M:%S')} | Press 'Q' to quit",
            (15, 60),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (200, 200, 200),
            1
        )
        
        cv2.imshow("AI Lab Face Recognition Attendance", display_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("\n[INFO] Stopping face recognition process...")
            break

    cap.release()
    cv2.destroyAllWindows()
    print("[INFO] Recognizer terminated cleanly.")


if __name__ == "__main__":
    main()
