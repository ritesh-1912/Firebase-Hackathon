import React from 'react';
import type { WorkspaceRecord } from '../services/workspaceStore';
import { deleteWorkspace } from '../services/workspaceStore';
import {
  Binary,
  Layers,
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
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-200">
            Persistent Research Vaults (Firestore:{' '}
            <span className="font-mono text-indigo-300">users/{uid.slice(0, 8)}.../workspaces</span>)
          </h2>
        </div>
        <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-mono">
          {workspaces.length} {workspaces.length === 1 ? 'Vault' : 'Vaults'}
        </span>
      </div>

      {workspaces.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          No research vaults persisted yet. Extract a knowledge graph above to create your first encrypted offline vault.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {workspaces.map((ws) => {
            const isSelected = selectedWorkspaceId === ws.id;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                className={`p-4 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between space-y-3 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-500/15 shadow-sm shadow-indigo-500/10'
                    : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between">
                    <h4 className="text-xs font-bold text-slate-100 truncate pr-2">{ws.name}</h4>
                    <button
                      onClick={(e) => handleDelete(e, ws.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 transition"
                      title="Delete research vault"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {ws.cloudBriefing?.executiveSummary || ws.redactedText.slice(0, 100) || 'Sanitized research document vault'}
                  </p>
                </div>

                {/* Vault Metadata Badges */}
                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center space-x-1.5">
                    <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-mono">
                      <Binary className="w-3 h-3" />
                      <span>{ws.nodes.length}N • {ws.edges.length}E</span>
                    </span>

                    {ws.redactionsCount > 0 && (
                      <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        <span>{ws.redactionsCount} PII</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    {ws.isOfflineCreated && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <WifiOff className="w-2.5 h-2.5" />
                        <span>Offline</span>
                      </span>
                    )}

                    {ws.cloudBriefing && (
                      <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Briefed</span>
                      </span>
                    )}

                    {ws.audioGenerated && (
                      <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded flex items-center gap-1">
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
