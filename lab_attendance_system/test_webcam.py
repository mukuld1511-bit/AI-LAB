"""
Quick webcam verification script.
Run this to confirm cv2.VideoCapture(0) can access your USB webcam.
Press 'q' in the preview window to close.
"""
import cv2
import sys

def test_webcam():
    print("[INFO] Attempting to open webcam at index 0...")
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("[FAIL] Could not open webcam at index 0.")
        print("       Possible causes:")
        print("       - No webcam connected")
        print("       - Another application is using the webcam")
        print("       - Wrong camera index (try 1 or 2)")
        sys.exit(1)

    print("[OK]   Webcam opened successfully!")
    ret, frame = cap.read()
    if not ret:
        print("[FAIL] Webcam opened but could not read a frame.")
        cap.release()
        sys.exit(1)

    h, w = frame.shape[:2]
    print(f"[OK]   Frame captured: {w}x{h} pixels")
    print("[INFO] Showing live preview. Press 'q' to close.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        cv2.putText(frame, "Webcam OK - Press Q to close", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("Webcam Test", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
    print("[DONE] Webcam test passed.")

if __name__ == "__main__":
    test_webcam()
