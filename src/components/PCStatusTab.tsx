import React, { useState, useEffect } from 'react';
import { PCStatus } from '../types';
import { Monitor, CheckCircle2, User, Clock, Copy, Check, RefreshCw, Send, AlertTriangle } from 'lucide-react';

interface PCStatusTabProps {
  pcs: PCStatus[];
  onOccupy: (pcId: string, name: string) => void;
  onFree: (pcId: string) => void;
}

export const PCStatusTab: React.FC<PCStatusTabProps> = ({ pcs, onOccupy, onFree }) => {
  const [selectedPc, setSelectedPc] = useState<string>('');
  const [studentName, setStudentName] = useState<string>('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [countdown, setCountdown] = useState<number>(10);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const freePcs = pcs.filter((p) => p.status === 'free');
  const occupiedPcs = pcs.filter((p) => p.status === 'occupied');

  // Set default selected PC if not set
  useEffect(() => {
    if (freePcs.length > 0 && (!selectedPc || !freePcs.some((p) => p.pc_id === selectedPc))) {
      setSelectedPc(freePcs[0].pc_id);
    }
  }, [pcs, freePcs, selectedPc]);

  // Auto-refresh countdown simulation (10 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 10;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const handleOccupySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPc || !studentName.trim()) return;
    onOccupy(selectedPc, studentName.trim());
    setActionSuccess(`Successfully marked ${selectedPc} as occupied by ${studentName.trim()}!`);
    setStudentName('');
    setTimeout(() => setActionSuccess(null), 4000);
  };

  const handleFreeClick = (pcId: string) => {
    onFree(pcId);
    setActionSuccess(`Successfully freed ${pcId}. Available for next person!`);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // 4 FIXED, HARDCODED, STATIC Message Templates
  const templates = [
    {
      id: 1,
      label: 'Available PCs',
      text: `Lab PC Availability Update:
The following PCs are currently free — [EDIT: PC LIST]
Please come to the AI Lab if you'd like to use one.

- Dr. Richa Choudhary`,
    },
    {
      id: 2,
      label: 'All Occupied',
      text: `Lab PC Availability Update:
All PCs in the AI Lab are currently occupied.
Will update once a system is free.

- Dr. Richa Choudhary`,
    },
    {
      id: 3,
      label: 'Assign Specific PC to Faculty',
      text: `Hi [EDIT: Faculty Name],
PC-[EDIT: X] is currently free in the AI Lab. You can come and use it.

- Dr. Richa Choudhary`,
    },
    {
      id: 4,
      label: 'Reminder to Free PC',
      text: `Reminder: If you're done using your PC in the AI Lab,
please mark it as "Free" on the tracker so others can use it.

- Dr. Richa Choudhary`,
    },
  ];

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2500);
  };

  const handleWhatsAppShare = (text: string) => {
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner & Metrics */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#f0f3ff] rounded-lg text-[#3525cd]">
                <Monitor className="w-6 h-6" />
              </span>
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#111c2d]">
                  AI Lab PC Occupancy Status
                </h2>
                <p className="text-xs sm:text-sm text-[#464555]">
                  Live status for faculty phone access over WiFi (No login required)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#f9f9ff] px-3 py-1.5 rounded-lg border border-[#c7c4d8]/40 text-xs text-[#464555]">
              <RefreshCw className={`w-3.5 h-3.5 text-[#3525cd] ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
              <span>Auto-refresh: <strong className="text-[#111c2d]">{countdown}s</strong></span>
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className="ml-1 underline text-[#3525cd] font-semibold"
              >
                {autoRefresh ? 'Pause' : 'Resume'}
              </button>
            </div>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mt-6">
          <div className="bg-[#f0f3ff] rounded-xl p-3 sm:p-4 border border-[#c7c4d8]/40 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-[#464555] block">
              Total Systems
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-[#111c2d] mt-1 block">
              {pcs.length}
            </span>
            <span className="text-[11px] text-[#464555] mt-0.5 block">PC-1 to PC-10</span>
          </div>

          <div className="bg-emerald-50 rounded-xl p-3 sm:p-4 border border-emerald-300 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block">
              🟢 Available Free
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-1 block">
              {freePcs.length}
            </span>
            <span className="text-[11px] text-emerald-800 mt-0.5 block">
              {Math.round((freePcs.length / pcs.length) * 100)}% Free
            </span>
          </div>

          <div className="bg-rose-50 rounded-xl p-3 sm:p-4 border border-rose-300 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800 block">
              🔴 Occupied
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-rose-700 mt-1 block">
              {occupiedPcs.length}
            </span>
            <span className="text-[11px] text-rose-800 mt-0.5 block">
              {occupiedPcs.length} in use
            </span>
          </div>
        </div>

        {actionSuccess && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-sm flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </div>

      {/* PC Grid (10 Systems) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[#111c2d] flex items-center gap-2">
            <span>Lab Floor Systems Grid</span>
            <span className="text-xs font-normal text-[#464555] bg-[#e7eeff] px-2 py-0.5 rounded-md">
              10 Physical Workstations
            </span>
          </h3>
          <span className="text-xs text-[#464555]">Click "Mark Free" when leaving</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
          {pcs.map((pc) => {
            const isFree = pc.status === 'free';
            return (
              <div
                key={pc.pc_id}
                id={`pc-card-${pc.pc_id}`}
                className={`rounded-xl p-4 transition-all duration-200 flex flex-col justify-between text-center relative ${
                  isFree
                    ? 'bg-emerald-50/70 border-2 border-emerald-400 shadow-xs hover:border-emerald-500'
                    : 'bg-rose-50/70 border-2 border-rose-400 shadow-xs hover:border-rose-500'
                }`}
              >
                {/* Header PC number */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#464555]">
                      Station
                    </span>
                    <span
                      className={`inline-block w-2.5 h-2.5 rounded-full ${
                        isFree ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                      }`}
                    ></span>
                  </div>

                  <div className="text-3xl sm:text-4xl font-extrabold text-[#111c2d] my-1 tracking-tight">
                    {pc.pc_id}
                  </div>

                  <div className="my-2">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                        isFree
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {isFree ? 'AVAILABLE' : 'OCCUPIED'}
                    </span>
                  </div>
                </div>

                {/* Body Meta */}
                <div className="mt-2 pt-2 border-t border-black/5 text-xs text-[#464555]">
                  {isFree ? (
                    <p className="text-emerald-800 font-medium py-1">
                      Ready for use
                    </p>
                  ) : (
                    <div className="space-y-1 py-1">
                      <div className="flex items-center justify-center gap-1 font-semibold text-[#111c2d]">
                        <User className="w-3.5 h-3.5 text-rose-600" />
                        <span className="truncate max-w-[120px]">{pc.occupied_by || 'User'}</span>
                      </div>
                      <div className="flex items-center justify-center gap-1 text-[11px] text-[#464555]">
                        <Clock className="w-3 h-3 text-rose-500" />
                        <span>Since: {pc.since_time ? pc.since_time.split(' ')[1] || pc.since_time : 'Just now'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action Button */}
                <div className="mt-3">
                  {isFree ? (
                    <button
                      onClick={() => {
                        setSelectedPc(pc.pc_id);
                        document.getElementById('claim-section')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="w-full py-1.5 px-2 bg-white text-emerald-700 font-semibold text-xs rounded-lg border border-emerald-300 hover:bg-emerald-100 transition-colors min-h-[36px]"
                    >
                      Claim PC
                    </button>
                  ) : (
                    <button
                      onClick={() => handleFreeClick(pc.pc_id)}
                      className="w-full py-1.5 px-2 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-700 transition-colors shadow-xs min-h-[36px] flex items-center justify-center gap-1"
                    >
                      <span>Mark Free</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Occupancy Controls Form */}
      <div id="claim-section" className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <h3 className="text-lg font-bold text-[#111c2d] mb-1 flex items-center gap-2">
          <span>Manual Occupancy Control (Sit & Mark)</span>
        </h3>
        <p className="text-xs sm:text-sm text-[#464555] mb-4">
          Self-serve registration: Select your PC station, enter your name, and click Mark Occupied.
        </p>

        {freePcs.length > 0 ? (
          <form onSubmit={handleOccupySubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-4">
              <label htmlFor="pc-select" className="block text-xs font-bold uppercase tracking-wider text-[#464555] mb-1.5">
                Select Free Station
              </label>
              <select
                id="pc-select"
                value={selectedPc}
                onChange={(e) => setSelectedPc(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm font-semibold text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
              >
                {freePcs.map((pc) => (
                  <option key={pc.pc_id} value={pc.pc_id}>
                    {pc.pc_id} (Available)
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-5">
              <label htmlFor="student-name" className="block text-xs font-bold uppercase tracking-wider text-[#464555] mb-1.5">
                Your Name / Faculty Name
              </label>
              <input
                id="student-name"
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g., Ayush, Dr. Sharma, Priya..."
                required
                className="w-full px-3.5 py-2.5 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
              />
            </div>

            <div className="sm:col-span-3">
              <button
                type="submit"
                id="btn-mark-occupied"
                className="w-full px-4 py-2.5 bg-[#3525cd] text-white font-bold text-sm rounded-lg hover:bg-[#281ca3] transition-colors shadow-sm flex items-center justify-center gap-2 min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark Occupied</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-bold">All 10 Lab PCs are currently occupied.</p>
              <p className="text-xs text-amber-800">
                Please check with Dr. Richa Choudhary or wait for a student/faculty member to free their system.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Messages Section */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-[#111c2d]">
                Quick Messages
              </h3>
              <p className="text-xs sm:text-sm text-[#464555]">
                Static broadcast templates for Dr. Richa Choudhary to copy-paste into WhatsApp / SMS groups:
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-[#e7eeff] text-[#3525cd] rounded-full">
              4 Fixed Templates
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl, idx) => (
            <div
              key={tpl.id}
              className="bg-[#f9f9ff] border border-[#c7c4d8]/50 rounded-xl p-4 flex flex-col justify-between relative group hover:border-[#3525cd]/60 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#3525cd] uppercase tracking-wider">
                    Template {tpl.id}: {tpl.label}
                  </span>
                  <span className="text-[11px] text-[#777587]">
                    Includes [EDIT: ...]
                  </span>
                </div>

                {/* Preformatted code block styled like st.code() */}
                <pre className="bg-[#111c2d] text-slate-100 p-3.5 rounded-lg text-xs font-mono whitespace-pre-wrap leading-relaxed border border-slate-700 select-all overflow-x-auto">
                  {tpl.text}
                </pre>
              </div>

              <div className="mt-3 pt-3 border-t border-[#c7c4d8]/30 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => handleWhatsAppShare(tpl.text)}
                  className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-semibold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopy(tpl.text, idx)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all min-h-[36px] ${
                    copiedIndex === idx
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-[#111c2d] border border-[#c7c4d8] hover:bg-[#f0f3ff]'
                  }`}
                >
                  {copiedIndex === idx ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#3525cd]" />
                      <span>Copy Template</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
