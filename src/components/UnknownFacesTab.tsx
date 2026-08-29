import React, { useState } from 'react';
import { UnknownFace } from '../types';
import { Camera, Calendar, Clock, UserPlus, Image as ImageIcon, ShieldAlert, Check } from 'lucide-react';

interface UnknownFacesTabProps {
  unknownFaces: UnknownFace[];
  onEnrollFace?: (name: string, faceId: string) => void;
}

export const UnknownFacesTab: React.FC<UnknownFacesTabProps> = ({ unknownFaces, onEnrollFace }) => {
  const [selectedImage, setSelectedImage] = useState<UnknownFace | null>(null);
  const [enrollName, setEnrollName] = useState('');
  const [enrolledSuccess, setEnrolledSuccess] = useState<string | null>(null);

  const handleEnrollSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedImage || !enrollName.trim()) return;

    if (onEnrollFace) {
      onEnrollFace(enrollName.trim(), selectedImage.id);
    }
    setEnrolledSuccess(`Successfully enrolled ${enrollName.trim()} into known_encodings.pkl!`);
    setEnrollName('');
    setSelectedImage(null);
    setTimeout(() => setEnrolledSuccess(null), 4000);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Banner */}
      <div className="bg-white rounded-xl p-5 sm:p-6 border border-[#c7c4d8]/40 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2.5 bg-amber-100 text-amber-800 rounded-xl">
              <ShieldAlert className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#111c2d]">
                Unknown Visitors & Face Snapshots
              </h2>
              <p className="text-xs sm:text-sm text-[#464555]">
                Auto-saved snapshots from <code className="bg-[#f0f3ff] text-[#3525cd] px-1.5 py-0.5 rounded">unknown_faces/YYYY-MM-DD/</code> for uncataloged faces detected by the camera
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f0f3ff] border border-[#c7c4d8]/50 rounded-lg text-xs font-semibold text-[#111c2d]">
            <span>Total Captured Snapshots:</span>
            <span className="px-2 py-0.5 bg-[#3525cd] text-white rounded-full">
              {unknownFaces.length}
            </span>
          </div>
        </div>

        {enrolledSuccess && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-lg text-sm flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{enrolledSuccess}</span>
          </div>
        )}
      </div>

      {/* Gallery Grid */}
      {unknownFaces.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {unknownFaces.map((face) => (
            <div
              key={face.id}
              className="bg-white rounded-xl border border-[#c7c4d8]/40 shadow-xs overflow-hidden flex flex-col justify-between group hover:border-[#3525cd]/60 transition-all"
            >
              {/* Snapshot image container */}
              <div className="relative aspect-square bg-slate-900 flex items-center justify-center overflow-hidden">
                {face.thumbnailUrl ? (
                  <img
                    src={face.thumbnailUrl}
                    alt={`Unknown face ${face.id}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-slate-800 to-slate-950 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                    <Camera className="w-10 h-10 text-slate-500 mb-2" />
                    <span className="text-xs font-mono font-semibold text-slate-300">
                      {face.filename}
                    </span>
                    <span className="text-[10px] text-slate-500 mt-1">
                      {face.image_path}
                    </span>
                  </div>
                )}

                <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-xs text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                  {face.id}
                </div>
              </div>

              {/* Card Meta & Action */}
              <div className="p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs text-[#464555]">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#3525cd]" />
                    <span>{face.date}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                    <span>{face.timestamp}</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedImage(face)}
                  className="w-full py-1.5 px-3 bg-[#f0f3ff] text-[#3525cd] font-bold text-xs rounded-lg hover:bg-[#e7eeff] border border-[#c7c4d8]/60 transition-colors flex items-center justify-center gap-1.5 min-h-[36px]"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Enroll as Member</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#c7c4d8]/40 p-12 text-center text-[#777587] shadow-xs">
          <ImageIcon className="w-12 h-12 text-[#c7c4d8] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#111c2d]">No Unknown Faces Captured Yet</h3>
          <p className="text-xs sm:text-sm text-[#464555] max-w-md mx-auto mt-1">
            When an unrecognized person enters the AI Lab and appears on camera, their cropped face image is automatically saved to <code className="text-[#3525cd]">unknown_faces/</code> and displayed here.
          </p>
        </div>
      )}

      {/* Enroll Modal Dialog */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-lg text-[#111c2d] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#3525cd]" />
                <span>Enroll Unknown Face</span>
              </h3>
              <button
                onClick={() => setSelectedImage(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} className="mt-4 space-y-4">
              <div className="flex items-center gap-4 p-3 bg-[#f0f3ff] rounded-xl border border-[#c7c4d8]/40">
                <div className="w-16 h-16 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                  {selectedImage.thumbnailUrl ? (
                    <img
                      src={selectedImage.thumbnailUrl}
                      alt="face crop"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Camera className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div className="text-xs text-[#464555]">
                  <p className="font-semibold text-[#111c2d]">
                    Snapshot: {selectedImage.filename}
                  </p>
                  <p>Date: {selectedImage.date}</p>
                  <p>Time: {selectedImage.timestamp}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-[#464555] mb-1">
                  Assign Person Name
                </label>
                <input
                  type="text"
                  value={enrollName}
                  onChange={(e) => setEnrollName(e.target.value)}
                  placeholder="e.g. Richa Mam, Dr. Verma, Rahul Sharma..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-[#f9f9ff] border border-[#c7c4d8] rounded-lg text-sm text-[#111c2d] focus:outline-none focus:border-[#3525cd] min-h-[44px]"
                />
                <p className="text-[11px] text-[#777587] mt-1">
                  This will register their 128-d face encoding into <code className="text-[#3525cd]">known_encodings.pkl</code>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedImage(null)}
                  className="px-4 py-2 text-xs font-semibold text-[#464555] hover:bg-slate-100 rounded-lg min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#3525cd] text-white font-bold text-xs rounded-lg hover:bg-[#281ca3] shadow-sm min-h-[40px] flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Register & Save Face</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
