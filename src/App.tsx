import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { PCStatusTab } from './components/PCStatusTab';
import { AttendanceLogsTab } from './components/AttendanceLogsTab';
import { UnknownFacesTab } from './components/UnknownFacesTab';
import { CameraSimulatorTab } from './components/CameraSimulatorTab';
import { ProjectCodeViewer } from './components/ProjectCodeViewer';
import { PCStatus, AttendanceLog, UnknownFace } from './types';

// Default initial PC state: PC-1 through PC-10, all status='free' (exact database.py seed)
const DEFAULT_PCS: PCStatus[] = Array.from({ length: 10 }, (_, i) => ({
  pc_id: `PC-${i + 1}`,
  status: 'free',
  occupied_by: null,
  since_time: null,
}));

export default function App() {
  const [activeTab, setActiveTab] = useState<'pc' | 'attendance' | 'unknown' | 'camera' | 'code'>('pc');

  // Load PCs from localStorage or use clean default (all 10 free)
  const [pcs, setPcs] = useState<PCStatus[]>(() => {
    const saved = localStorage.getItem('lab_pcs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return DEFAULT_PCS;
      }
    }
    return DEFAULT_PCS;
  });

  // Load Attendance Logs from localStorage or start clean
  const [logs, setLogs] = useState<AttendanceLog[]>(() => {
    const saved = localStorage.getItem('lab_attendance_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Load Unknown Faces from localStorage or start clean
  const [unknownFaces, setUnknownFaces] = useState<UnknownFace[]>(() => {
    const saved = localStorage.getItem('lab_unknown_faces');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Load Enrolled Members list from localStorage
  const [enrolledMembers, setEnrolledMembers] = useState<string[]>(() => {
    const saved = localStorage.getItem('lab_enrolled_members');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Save to localStorage on state changes
  useEffect(() => {
    localStorage.setItem('lab_pcs', JSON.stringify(pcs));
  }, [pcs]);

  useEffect(() => {
    localStorage.setItem('lab_attendance_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('lab_unknown_faces', JSON.stringify(unknownFaces));
  }, [unknownFaces]);

  useEffect(() => {
    localStorage.setItem('lab_enrolled_members', JSON.stringify(enrolledMembers));
  }, [enrolledMembers]);

  // Handler: Occupy PC
  const handleOccupyPC = (pcId: string, name: string) => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setPcs((prev) =>
      prev.map((pc) =>
        pc.pc_id === pcId
          ? { ...pc, status: 'occupied', occupied_by: name, since_time: nowStr }
          : pc
      )
    );
  };

  // Handler: Free PC
  const handleFreePC = (pcId: string) => {
    setPcs((prev) =>
      prev.map((pc) =>
        pc.pc_id === pcId
          ? { ...pc, status: 'free', occupied_by: null, since_time: null }
          : pc
      )
    );
  };

  // Handler: Log Attendance Event from Camera simulator
  const handleLogAttendance = (
    name: string,
    isKnown: boolean,
    inTime: string,
    outTime: string | null,
    capturedImage?: string
  ) => {
    const todayStr = new Date().toISOString().split('T')[0];

    if (outTime) {
      // Find open record and update out_time
      setLogs((prev) =>
        prev.map((log) =>
          log.name === name && log.date === todayStr && log.in_time && !log.out_time
            ? { ...log, out_time: outTime }
            : log
        )
      );
    } else {
      // Insert new in_time record
      const newId = (logs[0]?.id || 0) + 1;
      const relPath = isKnown
        ? null
        : `unknown_faces/${todayStr}/${new Date().toLocaleTimeString().replace(/:/g, '-')}.jpg`;

      const newLog: AttendanceLog = {
        id: newId,
        name,
        is_known: isKnown,
        image_path: relPath,
        in_time: inTime,
        out_time: null,
        date: todayStr,
      };
      setLogs((prev) => [newLog, ...prev]);

      if (!isKnown) {
        // Add to unknown faces gallery
        const newFace: UnknownFace = {
          id: name,
          image_path: relPath!,
          date: todayStr,
          timestamp: new Date().toLocaleTimeString(),
          filename: `${new Date().toLocaleTimeString().replace(/:/g, '-')}.jpg`,
          thumbnailUrl: capturedImage || undefined,
        };
        setUnknownFaces((prev) => [newFace, ...prev]);
      }
    }
  };

  // Handler: Enroll a new face
  const handleEnrollMember = (name: string) => {
    if (!enrolledMembers.includes(name)) {
      setEnrolledMembers((prev) => [...prev, name]);
    }
  };

  // Handler: Enroll Unknown Face as Known Person
  const handleEnrollUnknownFace = (name: string, faceId: string) => {
    handleEnrollMember(name);
    // Update matching attendance logs to known face
    setLogs((prev) =>
      prev.map((l) =>
        l.name === faceId
          ? { ...l, name, is_known: true }
          : l
      )
    );
    // Remove from unknown faces list
    setUnknownFaces((prev) => prev.filter((f) => f.id !== faceId));
  };

  // Handler: Reset Database State to clean defaults
  const handleResetData = () => {
    if (window.confirm('Reset all PC statuses and attendance logs to clean default?')) {
      setPcs(DEFAULT_PCS);
      setLogs([]);
      setUnknownFaces([]);
      localStorage.removeItem('lab_pcs');
      localStorage.removeItem('lab_attendance_logs');
      localStorage.removeItem('lab_unknown_faces');
    }
  };

  const occupiedCount = pcs.filter((p) => p.status === 'occupied').length;

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#111c2d] flex flex-col font-sans">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        occupiedCount={occupiedCount}
        totalCount={pcs.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'pc' && (
          <PCStatusTab
            pcs={pcs}
            onOccupy={handleOccupyPC}
            onFree={handleFreePC}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceLogsTab
            logs={logs}
          />
        )}

        {activeTab === 'unknown' && (
          <UnknownFacesTab
            unknownFaces={unknownFaces}
            onEnrollFace={handleEnrollUnknownFace}
          />
        )}

        {activeTab === 'camera' && (
          <CameraSimulatorTab
            onLogAttendance={handleLogAttendance}
            logs={logs}
            enrolledMembers={enrolledMembers}
            onEnrollMember={handleEnrollMember}
          />
        )}

        {activeTab === 'code' && (
          <ProjectCodeViewer />
        )}
      </main>

      <footer className="bg-white border-t border-[#c7c4d8]/40 py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#464555]">
          <p>
            AI/ML Laboratory Systems & Face Recognition Tracker • In-Charge: <strong>Dr. Richa Choudhary</strong> • Hardware: Intel i7-14700HX CPU-Only
          </p>
          <button
            onClick={handleResetData}
            className="text-xs text-slate-400 hover:text-rose-600 underline transition-colors"
          >
            Reset to Clean System State
          </button>
        </div>
      </footer>
    </div>
  );
}
