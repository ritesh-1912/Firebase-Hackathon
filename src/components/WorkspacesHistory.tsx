import React from 'react';
import type { WorkspaceRecord } from '../services/workspaceStore';
import { deleteWorkspace } from '../services/workspaceStore';
import {
  Binary,
  Trash2,
  WifiOff,
  Sparkles,
  Volume2,
  Lock,
} from 'lucide-react';

interface WorkspacesHistoryProps {
  workspaces: WorkspaceRecord[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (ws: WorkspaceRecord) => void;
  uid: string;
}

export const WorkspacesHistory: React.FC<WorkspacesHistoryProps> = ({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  uid,
}) => {
  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteWorkspace(uid, id);
    } catch (err) {
      console.error('[WorkspacesHistory] Failed to delete workspace:', err);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
        <span className="font-mono">users/{uid.slice(0, 8)}.../workspaces</span>
        <span className="font-mono tabular-nums">
          {workspaces.length} {workspaces.length === 1 ? 'vault' : 'vaults'}
        </span>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-8 text-[#A1A1AA] text-xs bg-[#18181B] border border-white/[0.06] rounded-xl">
          No persisted vaults yet. Process your sources to save to Firestore offline cache.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {workspaces.map((ws) => {
            const isSelected = selectedWorkspaceId === ws.id;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                className={`p-4 rounded-xl border text-left transition duration-150 cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-indigo-500/60 bg-[#18181B]'
                    : 'border-white/[0.08] bg-[#18181B]/60 hover:bg-[#18181B]'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-[#F4F4F5] truncate">{ws.name}</h4>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, ws.id)}
                      className="text-[#A1A1AA] hover:text-rose-400 p-0.5 transition duration-150 cursor-pointer"
                      title="Delete vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-[#A1A1AA] line-clamp-2 leading-relaxed">
                    {ws.cloudBriefing?.executiveSummary ||
                      ws.redactedText.slice(0, 100) ||
                      'Sanitized research vault'}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-mono tabular-nums">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-[#111114] text-[#F4F4F5] border border-white/[0.08] px-2 py-0.5 rounded inline-flex items-center gap-1">
                      <Binary className="w-3 h-3 text-indigo-400" />
                      <span>
                        {ws.nodes.length}N · {ws.edges.length}E
                      </span>
                    </span>

                    {ws.redactionsCount > 0 && (
                      <span className="bg-[#111114] text-emerald-400 border border-white/[0.08] px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span>{ws.redactionsCount} PII</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-[#A1A1AA] font-sans">
                    {ws.isOfflineCreated && (
                      <span className="inline-flex items-center gap-0.5 text-amber-400">
                        <WifiOff className="w-2.5 h-2.5" />
                        <span>Offline</span>
                      </span>
                    )}
                    {ws.cloudBriefing && (
                      <span className="inline-flex items-center gap-0.5 text-indigo-400">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Briefed</span>
                      </span>
                    )}
                    {ws.audioGenerated && (
                      <span className="inline-flex items-center gap-0.5 text-emerald-400">
                        <Volume2 className="w-2.5 h-2.5" />
                        <span>Audio</span>
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
