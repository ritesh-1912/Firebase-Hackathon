import React from 'react';
import type { AuditRecord } from '../services/recordsService';
import { deleteAuditRecord } from '../services/recordsService';
import {
  Cpu,
  Cloud,
  Trash2,
  WifiOff,
  Sparkles,
  Layers,
} from 'lucide-react';

interface RecordsHistoryProps {
  records: AuditRecord[];
  selectedRecordId: string | null;
  onSelectRecord: (record: AuditRecord) => void;
  uid: string;
}

export const RecordsHistory: React.FC<RecordsHistoryProps> = ({
  records,
  selectedRecordId,
  onSelectRecord,
  uid,
}) => {
  const handleDelete = async (e: React.MouseEvent, recordId: string) => {
    e.stopPropagation();
    try {
      await deleteAuditRecord(uid, recordId);
    } catch (err) {
      console.error('Failed to delete record:', err);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-slate-200">
            Persistent Records (Firestore offline-first: <span className="font-mono text-indigo-300">users/{uid.slice(0, 8)}.../records</span>)
          </h2>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-mono">
          {records.length} {records.length === 1 ? 'Record' : 'Records'}
        </span>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-xs">
          No audit records saved yet. Run an inspection above to create your first persistent record.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {records.map((r) => {
            const isSelected = selectedRecordId === r.id;
            return (
              <div
                key={r.id}
                onClick={() => onSelectRecord(r)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-sm shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between">
                    <h4 className="text-xs font-bold text-slate-100 truncate pr-2">{r.title}</h4>
                    <button
                      onClick={(e) => handleDelete(e, r.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition"
                      title="Delete record"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {r.localStructuredData.quickSummary || r.rawPrompt}
                  </p>
                </div>

                {/* Metadata Badges */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1 text-[10px]">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold uppercase flex items-center gap-1 ${
                        r.telemetry.executionSource === 'on-device'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      }`}
                    >
                      {r.telemetry.executionSource === 'on-device' ? (
                        <Cpu className="w-3 h-3" />
                      ) : (
                        <Cloud className="w-3 h-3" />
                      )}
                      <span>{r.telemetry.executionSource}</span>
                    </span>

                    <span className="font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {r.telemetry.latencyMs}ms
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    {r.isOfflineCreated && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" />
                        <span>Offline</span>
                      </span>
                    )}

                    {r.cloudSynthesis && (
                      <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Cloud Audited</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
