import React from 'react';
import { Monitor, Users, AlertCircle, Camera, Code2, Wifi } from 'lucide-react';

interface NavbarProps {
  activeTab: 'pc' | 'attendance' | 'unknown' | 'camera' | 'code';
  setActiveTab: (tab: 'pc' | 'attendance' | 'unknown' | 'camera' | 'code') => void;
  occupiedCount: number;
  totalCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  occupiedCount,
  totalCount,
}) => {
  const freeCount = totalCount - occupiedCount;

  return (
    <header className="bg-white border-b border-[#c7c4d8]/40 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* Logo & Lab Info */}
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[#3525cd] text-white flex items-center justify-center shadow-sm font-bold text-xl">
              AI
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-xl font-bold text-[#111c2d] leading-tight">
                  AI/ML Lab Systems
                </h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Local WiFi Live
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#464555] font-medium">
                Faculty In-Charge: <span className="text-[#3525cd] font-semibold">Richa Mam</span> • 10 Systems
              </p>
            </div>
          </div>

          {/* Quick Status Pill & Network Badge */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f0f3ff] rounded-lg border border-[#c7c4d8]/50 text-xs text-[#111c2d]">
              <span className="font-semibold">PC Availability:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">
                {freeCount} Free
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white">
                {occupiedCount} Occupied
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[#464555] px-2.5 py-1.5 bg-[#f9f9ff] rounded-md border border-[#c7c4d8]/40">
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>0.0.0.0:8000</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 border-t border-slate-100 no-scrollbar">
          <button
            onClick={() => setActiveTab('pc')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${
              activeTab === 'pc'
                ? 'bg-[#3525cd] text-white shadow-xs'
                : 'text-[#464555] hover:bg-[#f0f3ff] hover:text-[#111c2d]'
            }`}
          >
            <Monitor className="w-4 h-4" />
            <span>PC Status & Tracker</span>
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-xs ${activeTab === 'pc' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
              {freeCount} Free
            </span>
          </button>

          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${
              activeTab === 'attendance'
                ? 'bg-[#3525cd] text-white shadow-xs'
                : 'text-[#464555] hover:bg-[#f0f3ff] hover:text-[#111c2d]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Attendance Logs</span>
          </button>

          <button
            onClick={() => setActiveTab('unknown')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${
              activeTab === 'unknown'
                ? 'bg-[#3525cd] text-white shadow-xs'
                : 'text-[#464555] hover:bg-[#f0f3ff] hover:text-[#111c2d]'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Unknown Faces</span>
          </button>

          <button
            onClick={() => setActiveTab('camera')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${
              activeTab === 'camera'
                ? 'bg-[#3525cd] text-white shadow-xs'
                : 'text-[#464555] hover:bg-[#f0f3ff] hover:text-[#111c2d]'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Webcam & Enrollment</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors min-h-[44px] ${
              activeTab === 'code'
                ? 'bg-[#3525cd] text-white shadow-xs'
                : 'text-[#464555] hover:bg-[#f0f3ff] hover:text-[#111c2d]'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Python Files & Run Guide</span>
          </button>
        </div>
      </div>
    </header>
  );
};
