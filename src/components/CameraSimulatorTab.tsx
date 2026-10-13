import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, UserCheck, ShieldAlert, CheckCircle, Video, VideoOff, Play, Square, Terminal, UserPlus, AlertCircle } from 'lucide-react';
import { AttendanceLog } from '../types';

interface CameraSimulatorTabProps {
  onLogAttendance: (
    name: string,
    isKnown: boolean,
    inTime: string,
    outTime: string | null,
    capturedImage?: string
  ) => void;
  logs: AttendanceLog[];
  enrolledMembers: string[];
  onEnrollMember: (name: string) => void;
}

export const CameraSimulatorTab: React.FC<CameraSimulatorTabProps> = ({
  onLogAttendance,
  logs,
  enrolledMembers,
  onEnrollMember,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedFace, setDetectedFace] = useState<string | null>(null);
  const [enrollNameInput, setEnrollNameInput] = useState('');
  const [customTestName, setCustomTestName] = useState('');
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    '[SYSTEM START] Camera index 0 ready | Model: HOG (CPU-Only)',
    '[INFO] Initialized face recognition module & SQLite database',
    '[STANDBY] Waiting for face recognition loop...',
  ]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const appendConsole = (text: string) => {
    setConsoleLogs((prev) => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${text}`]);
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
      appendConsole('USB Webcam opened successfully (VideoCapture index 0).');
    } catch (err: any) {
      console.error(err);
      setCameraError('Webcam permission not granted or device not found in this environment.');
      appendConsole('Warning: Webcam not accessible directly. Running in simulated camera mode.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    appendConsole('Webcam stream closed.');
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Helper: Capture a snapshot frame from video canvas if camera is active
  const captureFrameDataUrl = (): string | undefined => {
    if (cameraActive && videoRef.current) {
      try {
        const video = videoRef.current;
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL('image/jpeg', 0.8);
        }
      } catch (e) {
        console.error('Frame capture failed', e);
      }
    }
    return undefined;
  };

  // Simulate Face Recognition Detection Event
  const triggerDetection = (personName: string, isKnown: boolean) => {
    if (!personName.trim()) return;
    const cleanName = personName.trim();
    const now = new Date();
    const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);
    const todayStr = now.toISOString().split('T')[0];
    const snapshot = captureFrameDataUrl();

    // Check if this person already has an open IN record today
    const recentLog = logs.find(
      (l) => l.name.toLowerCase() === cleanName.toLowerCase() && l.date === todayStr && l.in_time && !l.out_time
    );

    if (isKnown) {
      if (recentLog) {
        // Out-time event
        onLogAttendance(recentLog.name, true, recentLog.in_time || nowStr, nowStr, snapshot);
        appendConsole(`MATCH: ${cleanName} | Action: OUT | Status: Out-time logged (${nowStr})`);
        setDetectedFace(`${cleanName} (Exit - OUT Logged)`);
      } else {
        // In-time event
        onLogAttendance(cleanName, true, nowStr, null, snapshot);
        appendConsole(`MATCH: ${cleanName} | Action: IN | Status: In-time logged (${nowStr})`);
        setDetectedFace(`${cleanName} (Entry - IN Logged)`);
      }
    } else {
      // Unknown Face
      const unknownCount = logs.filter((l) => !l.is_known && l.date === todayStr).length + 1;
      const unknownLabel = `Unknown_${unknownCount}`;
      onLogAttendance(unknownLabel, false, nowStr, null, snapshot);
      appendConsole(`UNKNOWN FACE DETECTED | Action: IN | Saved snapshot -> unknown_faces/${todayStr}/ | Logged as ${unknownLabel}`);
      setDetectedFace(`${unknownLabel} (Unknown Visitor - Snapshot Saved)`);
    }

    setTimeout(() => setDetectedFace(null), 3500);
  };

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollNameInput.trim()) return;
    const name = enrollNameInput.trim();
    onEnrollMember(name);
    appendConsole(`[ENROLL_FACES] Photo frame processed -> 128-d encoding saved for '${name}' to known_encodings.pkl`);
    setEnrollNameInput('');
  };

  return (
    <div className="space-y-6 pb-12">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#111c2d]">
              Face Recognition & Live Camera Hub
            </h2>
            <p className="text-xs sm:text-sm text-[#464555]">
              Real-time OpenCV webcam capture and CPU-throttled face recognition attendance loop
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#3525cd] text-white font-bold text-xs rounded-lg hover:bg-[#281ca3] shadow-sm min-h-[40px]"
              >
                <Video className="w-4 h-4" />
                <span>Start Live Webcam (Index 0)</span>
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700 shadow-sm min-h-[40px]"
              >
                <VideoOff className="w-4 h-4" />
                <span>Stop Webcam</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Video Feed & Detection Controls */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800 shadow-md relative flex flex-col justify-center items-center min-h-[340px]">
            {cameraActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-auto max-h-[380px] object-cover"
              />
            ) : (
              <div className="p-8 text-center text-slate-400">
                <Camera className="w-16 h-16 text-slate-600 mx-auto mb-3" />
                <h4 className="font-bold text-slate-200">Webcam Feed (Hardware Index 0)</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Start your webcam or trigger attendance events using registered member buttons below.
                </p>
                {cameraError && (
                  <p className="text-xs text-amber-400 mt-2 bg-amber-950/50 p-2 rounded border border-amber-800">
                    {cameraError}
                  </p>
                )}
              </div>
            )}

            {/* Overlaid Detection Box Banner */}
            {detectedFace && (
              <div className="absolute top-4 left-4 right-4 bg-[#3525cd]/90 backdrop-blur-md text-white px-4 py-2.5 rounded-lg border border-indigo-400 shadow-lg flex items-center justify-between animate-fadeIn">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-emerald-300" />
                  <span className="font-bold text-sm">Face Detected: {detectedFace}</span>
                </div>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">
                  CPU HOG (2.0s)
                </span>
              </div>
            )}

            {/* Status indicator badge */}
            <div className="absolute bottom-3 left-3 bg-black/75 backdrop-blur-xs text-white text-xs px-3 py-1 rounded-full flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
              <span>{cameraActive ? 'Webcam 0 (Live Stream Active)' : 'Standby / Ready'}</span>
            </div>
          </div>

          {/* Dynamic Detection Trigger Panel */}
          <div className="bg-white rounded-xl p-5 border border-[#c7c4d8]/40 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#464555]">
                Trigger Recognition Event
              </h3>
              <p className="text-xs text-[#464555] mt-0.5">
                Simulates camera recognizing a known face (toggles IN/OUT) or an uncataloged visitor.
              </p>
            </div>

            {/* Enrolled members quick triggers */}
            {enrolledMembers.length > 0 ? (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-[#111c2d]">Recognize Registered Member:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {enrolledMembers.map((member) => (
                    <button
                      key={member}
                      type="button"
                      onClick={() => triggerDetection(member, true)}
                      className="p-2.5 bg-[#f0f3ff] text-[#111c2d] border border-[#c7c4d8]/50 hover:bg-[#e7eeff] hover:border-[#3525cd] font-bold text-xs rounded-lg text-left transition-colors flex items-center justify-between min-h-[38px]"
                    >
                      <span className="truncate">{member}</span>
                      <span className="text-[10px] bg-[#3525cd] text-white px-1.5 py-0.5 rounded shrink-0">
                        Trigger
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#f0f3ff] rounded-lg border border-[#c7c4d8]/40 text-xs text-[#464555] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#3525cd] shrink-0" />
                <span>No known faces enrolled yet. Use the registration form on the right to enroll members.</span>
              </div>
            )}

            {/* Custom person test or Unknown face */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={customTestName}
                  onChange={(e) => setCustomTestName(e.target.value)}
                  placeholder="Test custom member name..."
                  className="flex-1 px-3 py-2 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-xs text-[#111c2d] focus:outline-none focus:border-[#3525cd]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customTestName.trim()) {
                      triggerDetection(customTestName.trim(), true);
                      setCustomTestName('');
                    }
                  }}
                  disabled={!customTestName.trim()}
                  className="px-3 py-2 bg-[#3525cd] text-white font-bold text-xs rounded-lg hover:bg-[#281ca3] disabled:opacity-50 transition-colors"
                >
                  Test IN/OUT
                </button>
              </div>

              <button
                type="button"
                onClick={() => triggerDetection('Unknown Visitor', false)}
                className="py-2 px-3.5 bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shrink-0"
              >
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                <span>Detect Unknown Visitor</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Enrollment Form & Terminal Logs */}
        <div className="lg:col-span-5 space-y-6">
          {/* Enrollment Panel */}
          <div className="bg-white rounded-xl p-5 border border-[#c7c4d8]/40 shadow-xs">
            <h3 className="text-base font-bold text-[#111c2d] mb-1 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#3525cd]" />
              <span>Enroll New Face (enroll_faces.py)</span>
            </h3>
            <p className="text-xs text-[#464555] mb-3">
              Registers person in <code className="text-[#3525cd]">known_encodings.pkl</code>
            </p>

            <form onSubmit={handleEnrollSubmit} className="space-y-3">
              <input
                type="text"
                value={enrollNameInput}
                onChange={(e) => setEnrollNameInput(e.target.value)}
                placeholder="Enter person's name (e.g. Dr. Richa Choudhary)..."
                className="w-full px-3.5 py-2.5 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd]"
              />
              <button
                type="submit"
                disabled={!enrollNameInput.trim()}
                className="w-full py-2.5 px-4 bg-[#3525cd] text-white font-bold text-xs rounded-lg hover:bg-[#281ca3] disabled:opacity-50 shadow-sm min-h-[40px] flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" />
                <span>Capture & Register Face</span>
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100">
              <span className="text-xs font-bold text-[#464555] block mb-2">
                Enrolled Members ({enrolledMembers.length}):
              </span>
              {enrolledMembers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {enrolledMembers.map((name, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#f0f3ff] text-[#111c2d] rounded-md text-xs border border-[#c7c4d8]/40"
                    >
                      <CheckCircle className="w-3 h-3 text-emerald-600" />
                      <span>{name}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">No members enrolled yet.</p>
              )}
            </div>
          </div>

          {/* Recognizer Terminal Log Stream */}
          <div className="bg-[#111c2d] rounded-xl p-4 border border-slate-700 shadow-md text-slate-100 font-mono">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <Terminal className="w-4 h-4" />
                <span>recognizer.py Console Stream</span>
              </span>
              <span className="text-[10px] text-slate-400">Live</span>
            </div>

            <div className="space-y-1.5 text-xs overflow-y-auto max-h-[220px]">
              {consoleLogs.map((log, index) => (
                <div
                  key={index}
                  className={`leading-relaxed ${
                    log.includes('MATCH')
                      ? 'text-emerald-300'
                      : log.includes('UNKNOWN')
                      ? 'text-amber-300'
                      : 'text-slate-300'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

