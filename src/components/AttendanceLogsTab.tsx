import React, { useState } from 'react';
import { AttendanceLog } from '../types';
import { Search, Calendar, UserCheck, HelpCircle, LogIn, LogOut, Download, Filter } from 'lucide-react';

interface AttendanceLogsTabProps {
  logs: AttendanceLog[];
  onAddManualLog?: (name: string, isKnown: boolean) => void;
}

export const AttendanceLogsTab: React.FC<AttendanceLogsTabProps> = ({ logs, onAddManualLog }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [knownFilter, setKnownFilter] = useState<'all' | 'known' | 'unknown'>('all');

  // Quick filter logic
  const filteredLogs = logs.filter((log) => {
    const matchesName = searchTerm ? log.name.toLowerCase().includes(searchTerm.toLowerCase()) : true;
    const matchesDate = selectedDate ? log.date === selectedDate : true;
    const matchesKnown =
      knownFilter === 'all'
        ? true
        : knownFilter === 'known'
        ? log.is_known
        : !log.is_known;
    return matchesName && matchesDate && matchesKnown;
  });

  const totalLogs = logs.length;
  const knownCount = logs.filter((l) => l.is_known).length;
  const unknownCount = totalLogs - knownCount;
  const currentlyInLab = logs.filter((l) => l.in_time && !l.out_time).length;

  const exportCSV = () => {
    const headers = ['ID', 'Name', 'Is_Known', 'IN_Time', 'OUT_Time', 'Date'];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.name}"`,
      l.is_known ? 'TRUE' : 'FALSE',
      `"${l.in_time || ''}"`,
      `"${l.out_time || ''}"`,
      `"${l.date}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `lab_attendance_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#111c2d]">
              Lab Attendance Logs (Face Recognition Camera)
            </h2>
            <p className="text-xs sm:text-sm text-[#464555]">
              Automated in/out timestamp logs captured by the entrance camera running the CPU HOG recognizer
            </p>
          </div>

          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#f0f3ff] text-[#3525cd] border border-[#c7c4d8]/60 font-semibold text-xs rounded-lg hover:bg-[#e7eeff] transition-colors min-h-[40px]"
          >
            <Download className="w-4 h-4" />
            <span>Export to CSV</span>
          </button>
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <div className="bg-[#f0f3ff] rounded-xl p-3.5 border border-[#c7c4d8]/40">
            <span className="text-xs font-bold uppercase tracking-wider text-[#464555] block">
              Total Log Events
            </span>
            <span className="text-2xl font-extrabold text-[#111c2d] mt-1 block">
              {totalLogs}
            </span>
            <span className="text-[11px] text-[#464555]">Across all dates</span>
          </div>

          <div className="bg-emerald-50 rounded-xl p-3.5 border border-emerald-300">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block">
              Known Members
            </span>
            <span className="text-2xl font-extrabold text-emerald-700 mt-1 block">
              {knownCount}
            </span>
            <span className="text-[11px] text-emerald-800">Matched from pickle</span>
          </div>

          <div className="bg-amber-50 rounded-xl p-3.5 border border-amber-300">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-800 block">
              Unknown Faces
            </span>
            <span className="text-2xl font-extrabold text-amber-700 mt-1 block">
              {unknownCount}
            </span>
            <span className="text-[11px] text-amber-800">Photos stored in disk</span>
          </div>

          <div className="bg-indigo-50 rounded-xl p-3.5 border border-indigo-200">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 block">
              Inside Lab Now
            </span>
            <span className="text-2xl font-extrabold text-[#3525cd] mt-1 block">
              {currentlyInLab}
            </span>
            <span className="text-[11px] text-indigo-700">IN logged, no OUT yet</span>
          </div>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="bg-white rounded-xl p-4 sm:p-5 border border-[#c7c4d8]/40 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Search input */}
          <div className="sm:col-span-4 relative">
            <Search className="w-4 h-4 text-[#777587] absolute left-3 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by person name..."
              className="w-full pl-9 pr-3 py-2 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
            />
          </div>

          {/* Date picker */}
          <div className="sm:col-span-3 relative">
            <Calendar className="w-4 h-4 text-[#777587] absolute left-3 top-3.5" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
            />
          </div>

          {/* Type dropdown */}
          <div className="sm:col-span-3">
            <select
              value={knownFilter}
              onChange={(e) => setKnownFilter(e.target.value as any)}
              className="w-full px-3 py-2 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
            >
              <option value="all">All Faces (Known + Unknown)</option>
              <option value="known">Known Members Only</option>
              <option value="unknown">Unknown Visitors Only</option>
            </select>
          </div>

          {/* Reset Filters button */}
          <div className="sm:col-span-2">
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDate('');
                setKnownFilter('all');
              }}
              className="w-full py-2 px-3 bg-[#f0f3ff] text-[#464555] font-semibold text-xs rounded-lg border border-[#c7c4d8]/60 hover:bg-[#e7eeff] transition-colors min-h-[44px] flex items-center justify-center gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      </div>

      {/* Attendance Logs Table */}
      <div className="bg-white rounded-xl border border-[#c7c4d8]/40 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#c7c4d8]/40 flex items-center justify-between">
          <h3 className="font-bold text-[#111c2d] text-sm sm:text-base">
            Attendance Records ({filteredLogs.length} matching)
          </h3>
          <span className="text-xs text-[#464555]">
            Source: <code className="bg-[#f0f3ff] px-1.5 py-0.5 rounded text-[#3525cd]">attendance_logs</code> table
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-[#f0f3ff] text-[#464555] text-xs font-bold uppercase tracking-wider border-b border-[#c7c4d8]/40">
                <th className="py-3 px-4"># ID</th>
                <th className="py-3 px-4">Name / Subject</th>
                <th className="py-3 px-4">Recognition Type</th>
                <th className="py-3 px-4">IN Time</th>
                <th className="py-3 px-4">OUT Time</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Current Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const isInLab = log.in_time && !log.out_time;
                  return (
                    <tr key={log.id} className="hover:bg-[#f9f9ff] transition-colors">
                      <td className="py-3.5 px-4 font-mono text-xs text-[#777587]">
                        #{log.id}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#111c2d]">
                            {log.name}
                          </span>
                          {log.name === 'Dr. Richa Choudhary' && (
                            <span className="text-[10px] bg-[#e7eeff] text-[#3525cd] font-bold px-1.5 py-0.5 rounded">
                              Faculty In-Charge
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {log.is_known ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                            Known Face
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                            Unknown Face
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-[#111c2d]">
                        <div className="flex items-center gap-1.5">
                          <LogIn className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{log.in_time ? log.in_time.split(' ')[1] : '-'}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs">
                        {log.out_time ? (
                          <div className="flex items-center gap-1.5 text-[#111c2d]">
                            <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                            <span>{log.out_time.split(' ')[1]}</span>
                          </div>
                        ) : (
                          <span className="text-amber-700 font-semibold text-xs italic">
                            In Lab Now
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-[#464555]">
                        {log.date}
                      </td>
                      <td className="py-3.5 px-4">
                        {isInLab ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                            🟢 Active In Lab
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600">
                            ⚪ Exited
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[#777587]">
                    <p className="font-semibold text-sm">No attendance logs found</p>
                    <p className="text-xs text-[#464555] mt-1">
                      Try clearing search filters or run a face recognition simulation.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
