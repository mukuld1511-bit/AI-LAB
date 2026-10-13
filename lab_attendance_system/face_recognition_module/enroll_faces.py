import cv2
import face_recognition
import pickle
import os
import sys

# Path setup
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENCODINGS_FILE = os.path.join(CURRENT_DIR, "known_encodings.pkl")


def enroll():
    print("=" * 60)
    print("    AI/ML LAB - FACE ENROLLMENT MODULE (RICHA MAM)")
    print("=" * 60)

    # 1. Prompt user to type a name
    name = input("Enter person's name to register (e.g., Richa Mam, Ayush): ").strip()
    if not name:
        print("[ERROR] Name cannot be empty. Enrollment cancelled.")
        return

    # 2. Open webcam
    print("\n[INFO] Opening webcam (index 0)...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Could not open webcam (index 0). Please check your USB connection.")
        return

    print("[INSTRUCTIONS] Position face in front of the camera.")
    print("Press SPACE or 's' to capture photo, or 'q' to cancel.")

    captured_frame = None

    while True:
        ret, frame = cap.read()
        if not ret:
            print("[ERROR] Failed to read frame from webcam.")
            break

        # Display preview overlay
        display_frame = frame.copy()
        cv2.putText(
            display_frame,
            f"Enrolling: {name}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (0, 255, 0),
            2
        )
        cv2.putText(
            display_frame,
            "Press SPACE or 'S' to capture | 'Q' to quit",
            (20, 80),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            1
        )

        cv2.imshow("Enroll Face - AI Lab", display_frame)
        key = cv2.waitKey(1) & 0xFF

        if key == ord('q') or key == 27:
            print("[INFO] Enrollment cancelled by user.")
            break
        elif key == ord(' ') or key == ord('s') or key == ord('S'):
            captured_frame = frame
            print("[INFO] Photo captured successfully!")
            break

    cap.release()
    cv2.destroyAllWindows()

    if captured_frame is None:
        print("[INFO] No photo captured.")
        return

    # 3. Generate face encoding using face_recognition
    print("[INFO] Processing image and generating face encoding (CPU hog model)...")
    rgb_frame = cv2.cvtColor(captured_frame, cv2.COLOR_BGR2RGB)
    face_locations = face_recognition.face_locations(rgb_frame, model="hog")

    if len(face_locations) == 0:
        print("[ERROR] No face detected in the captured photo. Please try again with clear lighting.")
        return
    elif len(face_locations) > 1:
        print(f"[WARNING] Multiple faces ({len(face_locations)}) detected. Using the primary face.")

    encodings = face_recognition.face_encodings(rgb_frame, face_locations)
    if len(encodings) == 0:
        print("[ERROR] Could not extract face encodings. Please try again.")
        return

    new_encoding = encodings[0]

    # 4. Load existing known_encodings.pkl (or create new if doesn't exist)
    known_data = {}
    if os.path.exists(ENCODINGS_FILE):
        try:
            with open(ENCODINGS_FILE, "rb") as f:
                known_data = pickle.load(f)
                if not isinstance(known_data, dict):
                    known_data = {}
        except Exception as e:
            print(f"[WARNING] Could not load existing encodings: {e}. Starting fresh.")
            known_data = {}

    # Add or update {name: encoding}
    known_data[name] = new_encoding

    # 5. Save back to known_encodings.pkl
    try:
        with open(ENCODINGS_FILE, "wb") as f:
            pickle.dump(known_data, f)
        print(f"\n[SUCCESS] Successfully registered and saved encoding for '{name}'!")
        print(f"[INFO] Total registered people: {len(known_data)} ({', '.join(known_data.keys())})")
    except Exception as e:
        print(f"[ERROR] Failed to save encodings to {ENCODINGS_FILE}: {e}")


if __name__ == "__main__":
    enroll()
