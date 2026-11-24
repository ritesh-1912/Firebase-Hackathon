import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  signInAnonymouslyUser,
  signInWithGoogle,
  signOutUser,
  getDefaultInferenceMode,
} from './lib/firebase';
import {
  checkChromePromptAPIAvailability,
  redactAndExtractLocal,
  queryLocalWorkspace,
  synthesizeCloudBriefing,
  generateAudioBriefing,
  type TelemetryResult,
  type PromptAPIAvailabilityStatus,
  type GraphNode,
  type GraphEdge,
  type RedactionItem,
  type CloudBriefing,
} from './services/hybridAI';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { TelemetryHeader, type InferenceModeSetting } from './components/TelemetryHeader';
import {
  SourceVault,
  type SourceDocument,
  SAMPLE_HELIOS_CASE_STUDY,
} from './components/SourceVault';
import { GraphCanvas } from './components/GraphCanvas';
import { IntelligencePanel } from './components/IntelligencePanel';
import { WorkspacesHistory } from './components/WorkspacesHistory';
import {
  createWorkspace,
  saveWorkspace,
  subscribeToWorkspaces,
  type WorkspaceRecord,
} from './services/workspaceStore';
import { FolderGit2, X } from 'lucide-react';

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Network state (navigator.onLine)
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Chrome Prompt API State
  const [promptApiStatus, setPromptApiStatus] = useState<PromptAPIAvailabilityStatus>('unavailable');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  // Inference Mode Configuration (Remote Config vs Evaluator Manual Override)
  const [remoteConfigMode, setRemoteConfigMode] = useState<InferenceModeSetting>('prefer_on_device');
  const [activeMode, setActiveMode] = useState<InferenceModeSetting>('prefer_on_device');
  const [manualOverride, setManualOverride] = useState<boolean>(false);

  // Live Telemetry & Cumulative Savings
  const [lastTelemetry, setLastTelemetry] = useState<TelemetryResult | null>(null);
  const [cumulativeSavings, setCumulativeSavings] = useState({
    totalLocalRuns: 0,
    totalTokensSaved: 0,
    totalCostSavedUsd: 0,
  });

  // Firestore Sync State
  const [firestoreSyncState, setFirestoreSyncState] = useState<'Synced' | 'Offline Cache Active'>('Synced');

  // Workspaces History State
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);

  // 3-Pane Studio State
  const [documents, setDocuments] = useState<SourceDocument[]>(SAMPLE_HELIOS_CASE_STUDY);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(
    SAMPLE_HELIOS_CASE_STUDY[0].id
  );
  const [processingVault, setProcessingVault] = useState<boolean>(false);

  // Knowledge Graph Canvas State
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [localExtractionLatencyMs, setLocalExtractionLatencyMs] = useState<number>(0);

  // Redaction & Intelligence Panel State
  const [redactedText, setRedactedText] = useState<string>('');
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);
  const [cloudBriefing, setCloudBriefing] = useState<CloudBriefing | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<boolean>(false);

  // Mobile / Small Screen Studio Tab Switcher
  const [mobileTab, setMobileTab] = useState<'vault' | 'graph' | 'intelligence'>('graph');

  // 1. Auto-authenticate judges via Anonymous Auth on first load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthLoading(false);
      } else {
        try {
          setAuthLoading(true);
          const cred = await signInAnonymouslyUser();
          setUser(cred.user);
        } catch (err) {
          console.warn('[Auth] Anonymous auto-auth error:', err);
        } finally {
          setAuthLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Network connectivity listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setFirestoreSyncState('Synced');
    };
    const handleOffline = () => {
      setIsOnline(false);
      setFirestoreSyncState('Offline Cache Active');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. Check Chrome Prompt API availability & fetch Remote Config parameter
  useEffect(() => {
    checkChromePromptAPIAvailability((pct) => setDownloadProgress(pct))
      .then((res) => {
        setPromptApiStatus(res.status);
        if (res.downloadProgressPercentage) {
          setDownloadProgress(res.downloadProgressPercentage);
        }
      })
      .catch((err) => {
        console.warn('[App] Prompt API availability check warning:', err);
      });

    getDefaultInferenceMode().then((mode) => {
      setRemoteConfigMode(mode);
      if (!manualOverride) {
        setActiveMode(mode);
      }
    });
  }, [manualOverride]);

  // 4. Real-time Firestore workspaces listener with offline persistence
  useEffect(() => {
    if (!user) {
      setWorkspaces([]);
      return;
    }

    const unsubscribe = subscribeToWorkspaces(
      user.uid,
      (list) => {
        setWorkspaces(list);
        if (list.length > 0 && !activeWorkspaceId) {
          setActiveWorkspaceId(list[0].id);
        }
      },
      (err) => {
        console.warn('[App] Realtime workspaces subscription warning:', err);
        setFirestoreSyncState('Offline Cache Active');
      }
    );

    return () => unsubscribe();
  }, [user, activeWorkspaceId]);

  // Mode override handlers
  const handleSetMode = (mode: InferenceModeSetting, isManual: boolean) => {
    setActiveMode(mode);
    setManualOverride(isManual);
  };

  const handleResetToRemoteConfig = () => {
    setManualOverride(false);
    setActiveMode(remoteConfigMode);
  };

  // Helper to persist current session to Firestore
  const persistSession = useCallback(
    async (
      currentDocs: SourceDocument[],
      currentNodes: GraphNode[],
      currentEdges: GraphEdge[],
      currentRedacted: string,
      currentRedactionsCount: number,
      briefing: CloudBriefing | null,
      telemetry: TelemetryResult | null,
      audio?: string
    ) => {
      if (!user) return;

      try {
        let wsId = activeWorkspaceId;
        if (!wsId) {
          wsId = await createWorkspace(
            user.uid,
            'Project Helios Battery Incident Investigation',
            'Multi-source forensic investigation with local PII redaction and cross-document contradiction synthesis'
          );
          setActiveWorkspaceId(wsId);
        }

        const wsRecord: WorkspaceRecord = {
          id: wsId,
          name: 'Project Helios Battery Incident Investigation',
          description:
            'Multi-source forensic investigation with local PII redaction and cross-document contradiction synthesis',
          sources: currentDocs.map((d) => ({
            id: d.id,
            fileName: d.name,
            fileType: d.fileType,
            sizeBytes: d.sizeBytes,
            uploadedAt: d.timestamp,
            chunkCount: 1,
          })),
          redactedText: currentRedacted,
          redactionsCount: currentRedactionsCount,
          nodes: currentNodes,
          edges: currentEdges,
          cloudBriefing: briefing || undefined,
          lastTelemetry: telemetry || undefined,
          audioGenerated: Boolean(audio),
          audioUrl: audio,
          isOfflineCreated: !navigator.onLine,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveWorkspace(user.uid, wsRecord);
        setFirestoreSyncState(!navigator.onLine ? 'Offline Cache Active' : 'Synced');
      } catch (err) {
        console.warn('[App] Firestore session persist notice:', err);
        setFirestoreSyncState('Offline Cache Active');
      }
    },
    [user, activeWorkspaceId]
  );

  // Process all documents in the vault using local Gemini Nano (or prefer_on_device)
  const handleProcessVault = async () => {
    if (documents.length === 0 || processingVault) return;
    setProcessingVault(true);

    const aggregatedNodes: GraphNode[] = [];
    const aggregatedEdges: GraphEdge[] = [];
    const aggregatedRedactions: RedactionItem[] = [];
    let combinedRedactedText = '';
    let totalLatency = 0;
    let lastTel: TelemetryResult | null = null;

    try {
      const updatedDocs = [...documents];

      for (let i = 0; i < updatedDocs.length; i++) {
        const doc = updatedDocs[i];
        const res = await redactAndExtractLocal(
          doc.content,
          doc.imageFile,
          activeMode === 'only_on_device'
        );

        lastTel = res;
        totalLatency += res.latencyMs;

        // Cumulative savings update
        if (res.executionSource === 'on-device') {
          setCumulativeSavings((prev) => ({
            totalLocalRuns: prev.totalLocalRuns + 1,
            totalTokensSaved: prev.totalTokensSaved + res.estimatedTokensSaved,
            totalCostSavedUsd: prev.totalCostSavedUsd + res.estimatedCostSavedUsd,
          }));
        }

        // Aggregate nodes & edges
        res.extraction.nodes.forEach((n) => {
          if (!aggregatedNodes.some((existing) => existing.id === n.id)) {
            aggregatedNodes.push(n);
          }
        });

        res.extraction.edges.forEach((e) => {
          if (
            !aggregatedEdges.some(
              (existing) => existing.source === e.source && existing.target === e.target
            )
          ) {
            aggregatedEdges.push(e);
          }
        });

        aggregatedRedactions.push(...res.extraction.redactions);
        combinedRedactedText += `\n--- [DOCUMENT: ${doc.name}] ---\n` + res.extraction.redactedText;

        // Mark doc as processed
        updatedDocs[i] = {
          ...doc,
          status: {
            parsed: true,
            redactedLocally: true,
            graphIndexed: true,
          },
        };
      }

      setDocuments(updatedDocs);
      setNodes(aggregatedNodes);
      setEdges(aggregatedEdges);
      setRedactions(aggregatedRedactions);
      setRedactedText(combinedRedactedText);
      setLocalExtractionLatencyMs(Math.round(totalLatency / updatedDocs.length));

      if (lastTel) {
        setLastTelemetry(lastTel);
      }

      // Persist to Firestore (offline-capable)
      await persistSession(
        updatedDocs,
        aggregatedNodes,
        aggregatedEdges,
        combinedRedactedText,
        aggregatedRedactions.length,
        cloudBriefing,
        lastTel,
        audioUrl
      );
    } catch (err) {
      console.error('[App] Process Vault error:', err);
    } finally {
      setProcessingVault(false);
    }
  };

  // Run single-turn offline Q&A in the center pane
  const handleRunLocalQA = async (question: string): Promise<string> => {
    const activeDoc = documents.find((d) => d.id === activeDocumentId);
    const context = redactedText || activeDoc?.content || 'No context indexed.';

    const res = await queryLocalWorkspace(
      question,
      context,
      activeMode === 'only_on_device'
    );

    setLastTelemetry(res);

    if (res.executionSource === 'on-device') {
      setCumulativeSavings((prev) => ({
        totalLocalRuns: prev.totalLocalRuns + 1,
        totalTokensSaved: prev.totalTokensSaved + res.estimatedTokensSaved,
        totalCostSavedUsd: prev.totalCostSavedUsd + res.estimatedCostSavedUsd,
      }));
    }

    return res.text;
  };

  // Trigger Tier 2 Cloud Escalation (Gemini 3.8 Flash)
  const handleTriggerCloudSynthesis = async () => {
    if (!redactedText || isSynthesizing) return;
    setIsSynthesizing(true);

    try {
      const res = await synthesizeCloudBriefing({
        redactedText,
        nodes,
        edges,
      });

      setCloudBriefing(res.briefing);
      setLastTelemetry(res);

      await persistSession(
        documents,
        nodes,
        edges,
        redactedText,
        redactions.length,
        res.briefing,
        res,
        audioUrl
      );
    } catch (err) {
      console.error('[App] Cloud Synthesis error:', err);
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Generate Audio Briefing (gemini-3.1-flash-tts-preview + Web Speech fallback)
  const handleGenerateAudio = async () => {
    const textToSpeak =
      cloudBriefing?.executiveSummary ||
      redactedText.slice(0, 400) ||
      'SynapseVault Executive Intelligence Briefing ready.';

    setIsGeneratingAudio(true);
    try {
      const res = await generateAudioBriefing(textToSpeak);
      if (res.audioUrl) {
        setAudioUrl(res.audioUrl);
      }

      await persistSession(
        documents,
        nodes,
        edges,
        redactedText,
        redactions.length,
        cloudBriefing,
        lastTelemetry,
        res.audioUrl
      );
    } catch (err) {
      console.error('[App] Audio Generation error:', err);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Load sample Helios investigation
  const handleLoadSampleInvestigation = () => {
    setDocuments(SAMPLE_HELIOS_CASE_STUDY);
    setActiveDocumentId(SAMPLE_HELIOS_CASE_STUDY[0].id);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setRedactedText('');
    setRedactions([]);
    setCloudBriefing(null);
    setAudioUrl(undefined);
  };

  // Active document resolution
  const activeDocument = documents.find((d) => d.id === activeDocumentId) || documents[0];

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* 1. Persistent Hybrid Telemetry & Control HUD */}
      <TelemetryHeader
        promptApiStatus={promptApiStatus}
        downloadProgress={downloadProgress}
        activeMode={activeMode}
        remoteConfigMode={remoteConfigMode}
        manualOverride={manualOverride}
        onSetMode={handleSetMode}
        onResetToRemoteConfig={handleResetToRemoteConfig}
        lastTelemetry={lastTelemetry}
        cumulativeSavings={cumulativeSavings}
        isOnline={isOnline}
        firestoreSyncState={firestoreSyncState}
        user={user}
        authLoading={authLoading}
        onGoogleSignIn={() => signInWithGoogle()}
        onSignOut={() => signOutUser()}
      />

      {/* Mobile / Small Screen Navigation Tab Bar */}
      <div className="lg:hidden flex items-center justify-around bg-slate-900 border-b border-slate-800 text-xs py-2 px-4 shrink-0">
        <button
          onClick={() => setMobileTab('vault')}
          className={`px-3 py-1 rounded-md font-semibold ${
            mobileTab === 'vault' ? 'bg-cyan-600 text-white' : 'text-slate-400'
          }`}
        >
          Source Vault ({documents.length})
        </button>
        <button
          onClick={() => setMobileTab('graph')}
          className={`px-3 py-1 rounded-md font-semibold ${
            mobileTab === 'graph' ? 'bg-indigo-600 text-white' : 'text-slate-400'
          }`}
        >
          Knowledge Graph ({nodes.length})
        </button>
        <button
          onClick={() => setMobileTab('intelligence')}
          className={`px-3 py-1 rounded-md font-semibold ${
            mobileTab === 'intelligence' ? 'bg-purple-600 text-white' : 'text-slate-400'
          }`}
        >
          Intelligence Panel
        </button>
      </div>

      {/* 2. Flagship 3-Pane Studio Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Pane 1 (Left): Source Vault & 1-Click Judge Demo (w-80) */}
        <section
          className={`w-full lg:w-80 xl:w-84 shrink-0 h-full border-r border-slate-800 flex flex-col ${
            mobileTab === 'vault' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <SourceVault
            documents={documents}
            activeDocumentId={activeDocumentId}
            onSelectDocument={(doc) => setActiveDocumentId(doc.id)}
            onLoadSampleInvestigation={handleLoadSampleInvestigation}
            onUploadDocument={(newDoc) => {
              setDocuments((prev) => [newDoc, ...prev]);
              setActiveDocumentId(newDoc.id);
            }}
            onDeleteDocument={(docId) => {
              setDocuments((prev) => prev.filter((d) => d.id !== docId));
              if (activeDocumentId === docId) {
                setActiveDocumentId(documents[0]?.id || null);
              }
            }}
            onProcessVault={handleProcessVault}
            processingVault={processingVault}
          />
        </section>

        {/* Pane 2 (Center): Interactive Knowledge Graph Canvas (flex-1) */}
        <section
          className={`flex-1 h-full flex flex-col relative overflow-hidden bg-slate-950 ${
            mobileTab === 'graph' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            onSelectNode={(node) => setSelectedNode(node)}
            onRunLocalQA={handleRunLocalQA}
            localExtractionLatencyMs={localExtractionLatencyMs}
          />

          {/* Quick Trigger for Saved Workspaces / Offline Cache Drawer */}
          <button
            onClick={() => setShowHistoryModal(true)}
            className="absolute bottom-4 left-4 z-20 flex items-center space-x-1.5 bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 px-3 py-1.5 rounded-lg text-xs shadow-lg backdrop-blur-sm transition cursor-pointer"
            title="Inspect Firestore Persistent Workspaces"
          >
            <FolderGit2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Saved Investigations ({workspaces.length})</span>
          </button>
        </section>

        {/* Pane 3 (Right): Hybrid Intelligence Inspector (w-96 to w-[430px]) */}
        <section
          className={`w-full lg:w-96 xl:w-[430px] shrink-0 h-full border-l border-slate-800 flex flex-col ${
            mobileTab === 'intelligence' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          <IntelligencePanel
            originalText={activeDocument?.content || ''}
            redactedText={redactedText || ''}
            redactions={redactions}
            nodes={nodes}
            edges={edges}
            cloudBriefing={cloudBriefing}
            isSynthesizing={isSynthesizing}
            onTriggerCloudSynthesis={handleTriggerCloudSynthesis}
            audioUrl={audioUrl}
            isGeneratingAudio={isGeneratingAudio}
            onGenerateAudio={handleGenerateAudio}
            isOnline={isOnline}
            lastTelemetry={lastTelemetry}
            activeDocumentName={activeDocument?.name}
          />
        </section>
      </main>

      {/* Saved Workspaces & Offline Cache Modal Drawer */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <FolderGit2 className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">Firestore Persistent Workspaces</h3>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {user ? (
                <WorkspacesHistory
                  workspaces={workspaces}
                  selectedWorkspaceId={activeWorkspaceId}
                  onSelectWorkspace={(ws) => {
                    setActiveWorkspaceId(ws.id);
                    setRedactedText(ws.redactedText);
                    setNodes(ws.nodes);
                    setEdges(ws.edges);
                    if (ws.cloudBriefing) setCloudBriefing(ws.cloudBriefing);
                    if (ws.audioUrl) setAudioUrl(ws.audioUrl);
                    if (ws.lastTelemetry) setLastTelemetry(ws.lastTelemetry);
                    setShowHistoryModal(false);
                  }}
                  uid={user.uid}
                />
              ) : (
                <p className="text-xs text-slate-500">Sign in to view persistent workspaces.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
