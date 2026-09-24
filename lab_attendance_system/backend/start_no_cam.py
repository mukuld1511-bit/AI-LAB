"""
Temporary launcher that mocks face_recognition (dlib) so the backend
can start without the heavy native dependency.
Camera/enrollment endpoints will return graceful errors.
All other endpoints (PC status, attendance, email, timetable, etc.) work fully.
"""
import sys
import types

# Create a mock face_recognition module
mock_fr = types.ModuleType("face_recognition")
mock_fr.face_locations = lambda *a, **kw: []
mock_fr.face_encodings = lambda *a, **kw: []
mock_fr.compare_faces = lambda *a, **kw: []
mock_fr.face_distance = lambda *a, **kw: []
sys.modules["face_recognition"] = mock_fr

# Now import and run the real app
import main
import uvicorn

if __name__ == "__main__":
    uvicorn.run(main.app, host="0.0.0.0", port=8000)
