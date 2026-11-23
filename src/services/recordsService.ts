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
import { db } from '../lib/firebase';
import type { TelemetryResult } from './hybridAI';

export interface AuditRecord {
  id: string;
  title: string;
  category: 'field_inspection' | 'invoice_audit' | 'security_incident' | 'legal_compliance';
  rawPrompt: string;
  hasImage: boolean;
  imageUrl?: string;
  // Local On-Device Task Outputs (Low-latency, Private, Structured JSON)
  localStructuredData: {
    entities: Record<string, string | number>;
    piiDetected: boolean;
    piiEntities?: string[];
    riskScore: number; // 1-10
    quickSummary: string;
    actionItems: string[];
  };
  // Cloud-Escalated Deep Synthesis (Gemini 3.8 Flash)
  cloudSynthesis?: {
    executiveSummary: string;
    regulatoryRiskAnalysis: string;
    mitigationStrategy: string[];
    longTermComplianceScore: number; // 1-100
  };
  // Standardized Telemetry
  telemetry: TelemetryResult & {
    timestamp: number;
    modeUsed: 'prefer_on_device' | 'only_on_device' | 'only_in_cloud';
  };
  cloudTelemetry?: {
    latencyMs: number;
    timestamp: number;
  };
  isOfflineCreated: boolean;
  createdAt: number;
}

/**
 * Saves a new audit record to Firestore under users/{uid}/records.
 * Supported by Firestore offline persistence (IndexedDB cache).
 */
export async function saveAuditRecord(
  uid: string,
  recordData: Omit<AuditRecord, 'id' | 'createdAt'>
): Promise<string> {
  const recordsCol = collection(db, 'users', uid, 'records');
  const recordDoc = doc(recordsCol);
  const recordId = recordDoc.id;

  const payload = {
    ...recordData,
    id: recordId,
    createdAt: Date.now(),
    serverTime: serverTimestamp(),
  };

  await setDoc(recordDoc, payload);
  return recordId;
}

/**
 * Updates an existing audit record (e.g., when escalating to cloud synthesis)
 */
export async function updateAuditRecord(
  uid: string,
  recordId: string,
  updates: Partial<AuditRecord>
): Promise<void> {
  const recordDoc = doc(db, 'users', uid, 'records', recordId);
  await setDoc(recordDoc, updates, { merge: true });
}

/**
 * Deletes an audit record
 */
export async function deleteAuditRecord(uid: string, recordId: string): Promise<void> {
  const recordDoc = doc(db, 'users', uid, 'records', recordId);
  await deleteDoc(recordDoc);
}

/**
 * Subscribes to the real-time records stream under users/{uid}/records.
 * Immediately serves cached records while offline and syncs in real-time when online.
 */
export function subscribeToAuditRecords(
  uid: string,
  onRecords: (records: AuditRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const recordsCol = collection(db, 'users', uid, 'records');
  const q = query(recordsCol, orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const records: AuditRecord[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          title: data.title || 'Untitled Audit',
          category: data.category || 'field_inspection',
          rawPrompt: data.rawPrompt || '',
          hasImage: Boolean(data.hasImage),
          imageUrl: data.imageUrl,
          localStructuredData: data.localStructuredData || {
            entities: {},
            piiDetected: false,
            riskScore: 5,
            quickSummary: '',
            actionItems: [],
          },
          cloudSynthesis: data.cloudSynthesis,
          telemetry: data.telemetry || {
            text: '',
            executionSource: 'on-device',
            latencyMs: 0,
            fallbackTriggered: false,
            timestamp: Date.now(),
            modeUsed: 'prefer_on_device',
          },
          cloudTelemetry: data.cloudTelemetry,
          isOfflineCreated: Boolean(data.isOfflineCreated),
          createdAt: data.createdAt || Date.now(),
        };
      });
      onRecords(records);
    },
    (error) => {
      console.warn('[Firestore] Records subscription warning:', error);
      if (onError) onError(error);
    }
  );
}
