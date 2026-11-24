import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, getAutoPiiFirewallEnabled } from '../lib/firebase';
import type {
  GraphNode,
  GraphEdge,
  CloudBriefing,
  TelemetryResult,
} from './hybridAI';
import { applyClientPiiFirewall } from './hybridAI';

export interface WorkspaceSourceDoc {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'markdown' | 'text' | 'image';
  sizeBytes: number;
  uploadedAt: number;
  chunkCount: number;
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  sources: WorkspaceSourceDoc[];
  redactedText: string;
  redactionsCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  cloudBriefing?: CloudBriefing;
  lastTelemetry?: TelemetryResult;
  audioGenerated?: boolean;
  audioUrl?: string;
  isOfflineCreated: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Creates a new workspace in Firestore under users/{uid}/workspaces/{workspaceId}
 * Works 100% offline via Firestore IndexedDB persistent local cache.
 */
export async function createWorkspace(
  uid: string,
  name: string,
  description = ''
): Promise<string> {
  const workspacesCol = collection(db, 'users', uid, 'workspaces');
  const newDoc = doc(workspacesCol);
  const workspaceId = newDoc.id;

  const now = Date.now();
  const initialWorkspace: WorkspaceRecord = {
    id: workspaceId,
    name,
    description,
    sources: [],
    redactedText: '',
    redactionsCount: 0,
    nodes: [],
    edges: [],
    isOfflineCreated: !navigator.onLine,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(newDoc, {
    ...initialWorkspace,
    serverTime: serverTimestamp(),
  });

  return workspaceId;
}

/**
 * Saves or updates a workspace record in Firestore.
 * Automatically guarantees zero unredacted PII is written if auto_pii_firewall is enabled.
 */
export async function saveWorkspace(
  uid: string,
  workspace: WorkspaceRecord
): Promise<void> {
  const workspaceDoc = doc(db, 'users', uid, 'workspaces', workspace.id);

  let sanitizedText = workspace.redactedText;
  const firewallEnabled = await getAutoPiiFirewallEnabled();

  if (firewallEnabled && sanitizedText) {
    const check = applyClientPiiFirewall(sanitizedText);
    sanitizedText = check.sanitized;
  }

  const payload = {
    ...workspace,
    redactedText: sanitizedText,
    updatedAt: Date.now(),
    serverTime: serverTimestamp(),
  };

  await setDoc(workspaceDoc, payload, { merge: true });
}

/**
 * Updates partial fields in a workspace record
 */
export async function updateWorkspace(
  uid: string,
  workspaceId: string,
  updates: Partial<WorkspaceRecord>
): Promise<void> {
  const workspaceDoc = doc(db, 'users', uid, 'workspaces', workspaceId);

  const payload: any = {
    ...updates,
    updatedAt: Date.now(),
  };

  const firewallEnabled = await getAutoPiiFirewallEnabled();
  if (firewallEnabled && updates.redactedText) {
    payload.redactedText = applyClientPiiFirewall(updates.redactedText).sanitized;
  }

  await setDoc(workspaceDoc, payload, { merge: true });
}

/**
 * Deletes a workspace record
 */
export async function deleteWorkspace(
  uid: string,
  workspaceId: string
): Promise<void> {
  const workspaceDoc = doc(db, 'users', uid, 'workspaces', workspaceId);
  await deleteDoc(workspaceDoc);
}

/**
 * Subscribes to real-time workspaces stream under users/{uid}/workspaces
 */
export function subscribeToWorkspaces(
  uid: string,
  onWorkspaces: (workspaces: WorkspaceRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const workspacesCol = collection(db, 'users', uid, 'workspaces');
  const q = query(workspacesCol, orderBy('updatedAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: WorkspaceRecord[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || 'Untitled Workspace',
          description: data.description || '',
          sources: data.sources || [],
          redactedText: data.redactedText || '',
          redactionsCount: data.redactionsCount || 0,
          nodes: data.nodes || [],
          edges: data.edges || [],
          cloudBriefing: data.cloudBriefing,
          lastTelemetry: data.lastTelemetry,
          audioGenerated: Boolean(data.audioGenerated),
          audioUrl: data.audioUrl,
          isOfflineCreated: Boolean(data.isOfflineCreated),
          createdAt: data.createdAt || Date.now(),
          updatedAt: data.updatedAt || Date.now(),
        };
      });
      onWorkspaces(list);
    },
    (err) => {
      console.warn('[WorkspaceStore] Realtime subscription error:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Subscribes to a single workspace document
 */
export function subscribeToWorkspace(
  uid: string,
  workspaceId: string,
  onWorkspace: (ws: WorkspaceRecord | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const workspaceDoc = doc(db, 'users', uid, 'workspaces', workspaceId);

  return onSnapshot(
    workspaceDoc,
    (snapshot) => {
      if (!snapshot.exists()) {
        onWorkspace(null);
        return;
      }
      const data = snapshot.data();
      const ws: WorkspaceRecord = {
        id: snapshot.id,
        name: data.name || 'Untitled Workspace',
        description: data.description || '',
        sources: data.sources || [],
        redactedText: data.redactedText || '',
        redactionsCount: data.redactionsCount || 0,
        nodes: data.nodes || [],
        edges: data.edges || [],
        cloudBriefing: data.cloudBriefing,
        lastTelemetry: data.lastTelemetry,
        audioGenerated: Boolean(data.audioGenerated),
        audioUrl: data.audioUrl,
        isOfflineCreated: Boolean(data.isOfflineCreated),
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
      };
      onWorkspace(ws);
    },
    (err) => {
      console.warn('[WorkspaceStore] Single workspace subscription error:', err);
      if (onError) onError(err);
    }
  );
}
