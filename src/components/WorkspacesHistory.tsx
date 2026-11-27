import React from 'react';
import type { WorkspaceRecord } from '../services/workspaceStore';
import { deleteWorkspace } from '../services/workspaceStore';
import { Trash2 } from 'lucide-react';

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
      <div className="flex items-center justify-between text-[12px] text-[#63635E]">
        <span className="font-mono">users/{uid.slice(0, 8)}.../workspaces</span>
        <span className="font-mono tabular-nums">
          {workspaces.length} {workspaces.length === 1 ? 'vault' : 'vaults'}
        </span>
      </div>

      {workspaces.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-[#63635E] border-t border-[#E6E6E2]">
          No saved vaults yet. Extract a source set to persist it to Firestore.
        </p>
      ) : (
        <div className="divide-y divide-[#E6E6E2] border-t border-[#E6E6E2]">
          {workspaces.map((ws) => {
            const isSelected = selectedWorkspaceId === ws.id;
            return (
              <div
                key={ws.id}
                onClick={() => onSelectWorkspace(ws)}
                className={`py-3.5 px-2 flex items-start justify-between gap-4 transition duration-150 cursor-pointer ${
                  isSelected ? 'bg-[#F3F3EF]' : 'hover:bg-[#FBFBF9]'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="text-[13px] font-medium text-[#141413] truncate">{ws.name}</div>
                  <div className="text-[12px] font-mono tabular-nums text-[#63635E]">
                    {ws.nodes.length} nodes · {ws.edges.length} edges · {ws.redactionsCount}{' '}
                    redactions
                    {ws.cloudBriefing ? ' · briefed' : ''}
                    {ws.audioGenerated ? ' · audio' : ''}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => handleDelete(e, ws.id)}
                  className="text-[#94948E] hover:text-[#B91C1C] p-1 transition duration-150 cursor-pointer shrink-0"
                  title="Delete vault"
                  aria-label={`Delete ${ws.name}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
