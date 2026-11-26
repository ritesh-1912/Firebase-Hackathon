import { useState, useEffect, useCallback } from 'react';
import {
  auth,
  signInAnonymouslyUser,
  signInWithGoogle,
  signOutUser,
  getDefaultInferenceMode,
  firebaseInitDiagnostic,
} from './lib/firebase';
import {
  checkChromePromptAPIAvailability,
  redactAndExtractLocal,
  queryLocalWorkspace,
  synthesizeCloudBriefing,
  generateAudioBriefing,
  applyClientPiiFirewall,
  type TelemetryResult,
  type PromptAPIAvailabilityStatus,
  type GraphNode,
  type GraphEdge,
  type RedactionItem,
  type CloudBriefing,
} from './services/hybridAI';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  TelemetryHeader,
  type InferenceModeSetting,
  type StudioView,
} from './components/TelemetryHeader';
import {
  SourceVault,
  EmptyOnboardingCanvas,
  type SourceDocument,
  SAMPLE_HELIOS_CASE_STUDY,
} from './components/SourceVault';
import { GraphCanvas, type LocalQAResponse } from './components/GraphCanvas';
import { IntelligencePanel } from './components/IntelligencePanel';
import { WorkspacesHistory } from './components/WorkspacesHistory';
import { BenchmarkModal } from './components/BenchmarkModal';
import { createWorkspace, saveWorkspace, subscribeToWorkspaces, type WorkspaceRecord } from './services/workspaceStore';
import { FolderArchive, X, AlertTriangle } from 'lucide-react';

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

  // Inference Mode Configuration
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

  // Firestore Sync & Workspaces State
  const [firestoreSyncState, setFirestoreSyncState] = useState<'Synced' | 'Offline Cache Active'>(
    'Synced'
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<boolean>(false);
  const [showBenchmarkModal, setShowBenchmarkModal] = useState<boolean>(false);

  // Studio Navigation & Collapsible Sidebar
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<StudioView>('graph');

  // Vault & Extraction State (starts empty for high-impact onboarding canvas)
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [processingVault, setProcessingVault] = useState<boolean>(false);

  // Graph & Intelligence State
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [localExtractionLatencyMs, setLocalExtractionLatencyMs] = useState<number>(0);
  const [redactedText, setRedactedText] = useState<string>('');
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);
  const [cloudBriefing, setCloudBriefing] = useState<CloudBriefing | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [audioUsedFallback, setAudioUsedFallback] = useState<boolean>(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<boolean>(false);
  const [pipelineToast, setPipelineToast] = useState<string | null>(null);

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

  const handleSetMode = (mode: InferenceModeSetting, isManual: boolean) => {
    setActiveMode(mode);
    setManualOverride(isManual);
  };

  const handleResetToRemoteConfig = () => {
    setManualOverride(false);
    setActiveMode(remoteConfigMode);
  };

  // Persist current session to Firestore
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

  // Core vault processor (accepts explicit list so 1-click sample demo can trigger immediately)
  const processDocuments = async (targetDocs: SourceDocument[]) => {
    if (targetDocs.length === 0 || processingVault) return;
    setProcessingVault(true);
    setPipelineToast(null);

    const aggregatedNodes: GraphNode[] = [];
    const aggregatedEdges: GraphEdge[] = [];
    const aggregatedRedactions: RedactionItem[] = [];
    let combinedRedactedText = '';
    let totalLatency = 0;
    let lastTel: TelemetryResult | null = null;

    try {
      const updatedDocs = [...targetDocs];

      for (let i = 0; i < updatedDocs.length; i++) {
        const doc = updatedDocs[i];
        const res = await redactAndExtractLocal(doc.content, doc.imageFile, activeMode);

        lastTel = res;
        totalLatency += res.latencyMs;

        if (res.executionSource === 'on-device') {
          setCumulativeSavings((prev) => ({
            totalLocalRuns: prev.totalLocalRuns + 1,
            totalTokensSaved: prev.totalTokensSaved + res.estimatedTokensSaved,
            totalCostSavedUsd: prev.totalCostSavedUsd + res.estimatedCostSavedUsd,
          }));
        }

        const docPrefix = `d${i}_`;
        res.extraction.nodes.forEach((n) => {
          const namespacedId = `${docPrefix}${n.id}`;
          if (!aggregatedNodes.some((existing) => existing.id === namespacedId)) {
            aggregatedNodes.push({ ...n, id: namespacedId });
          }
        });

        res.extraction.edges.forEach((e) => {
          const src = `${docPrefix}${e.source}`;
          const tgt = `${docPrefix}${e.target}`;
          if (
            !aggregatedEdges.some(
              (existing) => existing.source === src && existing.target === tgt
            )
          ) {
            aggregatedEdges.push({ ...e, source: src, target: tgt });
          }
        });

        aggregatedRedactions.push(...res.extraction.redactions);
        combinedRedactedText += `\n--- [DOCUMENT: ${doc.name}] ---\n` + res.extraction.redactedText;

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
      const fallbackSanitized = targetDocs.map((d) => {
        const fw = applyClientPiiFirewall(d.content);
        return {
          doc: { ...d, status: { ...d.status, redactedLocally: true } },
          text: `\n--- [DOCUMENT: ${d.name}] ---\n${fw.sanitized}`,
          redactions: fw.extraRedactions,
        };
      });
      setDocuments(fallbackSanitized.map((x) => x.doc));
      setRedactedText(fallbackSanitized.map((x) => x.text).join(''));
      setRedactions(fallbackSanitized.flatMap((x) => x.redactions));
      setPipelineToast(
        `AI extraction unavailable (${err instanceof Error ? err.message : String(err)}). Local PII Firewall still sanitized all sources.`
      );
    } finally {
      setProcessingVault(false);
    }
  };

  // Run single-turn Q&A in the center canvas dock
  const handleRunLocalQA = async (question: string): Promise<LocalQAResponse> => {
    const activeDoc = documents.find((d) => d.id === activeDocumentId);
    const rawContext = redactedText || activeDoc?.content || 'No context indexed.';
    const safeContext = redactedText
      ? rawContext
      : applyClientPiiFirewall(rawContext).sanitized;

    const res = await queryLocalWorkspace(question, safeContext, activeMode);
    setLastTelemetry(res);

    if (res.executionSource === 'on-device') {
      setCumulativeSavings((prev) => ({
        totalLocalRuns: prev.totalLocalRuns + 1,
        totalTokensSaved: prev.totalTokensSaved + res.estimatedTokensSaved,
        totalCostSavedUsd: prev.totalCostSavedUsd + res.estimatedCostSavedUsd,
      }));
    }

    return {
      answer: res.text,
      executionSource: res.executionSource,
      latencyMs: res.latencyMs,
    };
  };

  // Trigger Tier 2 Cloud Escalation (Gemini 3.8 Flash)
  const handleTriggerCloudSynthesis = async () => {
    if (!redactedText || isSynthesizing) return;
    setIsSynthesizing(true);
    setPipelineToast(null);

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
      setPipelineToast(
        `Cloud synthesis failed: ${err instanceof Error ? err.message : String(err)}`
      );
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
    setPipelineToast(null);
    try {
      const res = await generateAudioBriefing(textToSpeak);
      setAudioUsedFallback(res.usedFallback);
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
      setPipelineToast(
        `Audio briefing failed: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // 1-Click Judge Demo: populates Project Helios docs and runs extraction immediately
  const handleLoadSampleInvestigation = () => {
    const freshDocs = SAMPLE_HELIOS_CASE_STUDY.map((d) => ({
      ...d,
      status: { parsed: true, redactedLocally: false, graphIndexed: false },
    }));
    setPipelineToast(null);
    setDocuments(freshDocs);
    setActiveDocumentId(freshDocs[0].id);
    setNodes([]);
    setEdges([]);
    setSelectedNode(null);
    setRedactedText('');
    setRedactions([]);
    setCloudBriefing(null);
    setAudioUrl(undefined);
    setAudioUsedFallback(false);
    setActiveView('graph');
    setSidebarOpen(true);
    void processDocuments(freshDocs);
  };

  const activeDocument = documents.find((d) => d.id === activeDocumentId) || documents[0];

  return (
    <div className="h-screen w-screen bg-[#09090B] text-[#F4F4F5] flex flex-col font-sans overflow-hidden">
      {/* 1. Slim 52px Studio Top Bar with Telemetry Popover */}
      <TelemetryHeader
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        activeView={activeView}
        onSelectView={setActiveView}
        redactionsCount={redactions.length}
        hasCloudBriefing={Boolean(cloudBriefing)}
        promptApiStatus={promptApiStatus}
        downloadProgress={downloadProgress}
        activeMode={activeMode}
        remoteConfigMode={remoteConfigMode}
        manualOverride={manualOverride}
        onSetMode={handleSetMode}
        onResetToRemoteConfig={handleResetToRemoteConfig}
        onOpenBenchmark={() => setShowBenchmarkModal(true)}
        lastTelemetry={lastTelemetry}
        cumulativeSavings={cumulativeSavings}
        isOnline={isOnline}
        firestoreSyncState={firestoreSyncState}
        firebaseDiagnostic={firebaseInitDiagnostic}
        user={user}
        authLoading={authLoading}
        onGoogleSignIn={() => signInWithGoogle()}
        onSignOut={() => signOutUser()}
      />

      {/* 2. Studio Workspace Body */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Collapsible Slim Left Source Vault (260px) */}
        {sidebarOpen && (
          <div className="fixed inset-y-[52px] left-0 z-40 lg:static lg:inset-auto h-[calc(100vh-52px)] lg:h-full">
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
                setDocuments((prev) => {
                  const next = prev.filter((d) => d.id !== docId);
                  if (activeDocumentId === docId) {
                    setActiveDocumentId(next[0]?.id || null);
                  }
                  return next;
                });
              }}
              onProcessVault={() => processDocuments(documents)}
              processingVault={processingVault}
              savedWorkspacesCount={workspaces.length}
              onOpenSavedWorkspaces={() => setShowHistoryModal(true)}
            />
          </div>
        )}

        {/* Main Studio Area: Guided Empty State OR Selected Studio View */}
        <section className="flex-1 h-full flex flex-col relative overflow-hidden bg-[#09090B]">
          {activeView === 'graph' && documents.length === 0 ? (
            <EmptyOnboardingCanvas
              onLoadSampleInvestigation={handleLoadSampleInvestigation}
              onUploadDocument={(newDoc) => {
                setDocuments((prev) => [newDoc, ...prev]);
                setActiveDocumentId(newDoc.id);
                setSidebarOpen(true);
              }}
            />
          ) : activeView === 'graph' ? (
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              documents={documents}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNode}
              onRunLocalQA={handleRunLocalQA}
              localExtractionLatencyMs={localExtractionLatencyMs}
              processingVault={processingVault}
              onProcessVault={() => processDocuments(documents)}
            />
          ) : (
            <IntelligencePanel
              view={activeView}
              originalText={activeDocument?.content || ''}
              redactedText={redactedText}
              redactions={redactions}
              nodes={nodes}
              edges={edges}
              cloudBriefing={cloudBriefing}
              isSynthesizing={isSynthesizing}
              onTriggerCloudSynthesis={handleTriggerCloudSynthesis}
              audioUrl={audioUrl}
              audioUsedFallback={audioUsedFallback}
              isGeneratingAudio={isGeneratingAudio}
              onGenerateAudio={handleGenerateAudio}
              isOnline={isOnline}
              lastTelemetry={lastTelemetry}
              activeDocumentName={activeDocument?.name}
              onProcessVault={() => processDocuments(documents)}
              processingVault={processingVault}
            />
          )}

          {/* Non-intrusive Floating Error Toast (replaces permanent full-width top banners) */}
          {pipelineToast && (
            <div className="fixed top-16 right-4 z-50 max-w-md bg-[#18181B] border border-rose-500/30 rounded-xl p-3 shadow-2xl flex items-start gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{pipelineToast}</span>
              <button
                type="button"
                onClick={() => setPipelineToast(null)}
                className="text-[#A1A1AA] hover:text-[#F4F4F5] p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Saved Workspaces Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#111114] border border-white/[0.08] rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <FolderArchive className="w-4 h-4 text-indigo-400" />
                <h3 className="font-semibold text-sm text-[#F4F4F5]">Saved Vaults</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="text-[#A1A1AA] hover:text-[#F4F4F5] p-1 rounded-lg hover:bg-[#18181B] transition duration-150 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              {user ? (
                <WorkspacesHistory
                  workspaces={workspaces}
                  selectedWorkspaceId={activeWorkspaceId}
                  onSelectWorkspace={(ws) => {
                    setActiveWorkspaceId(ws.id);
                    setRedactedText(ws.redactedText);
                    setNodes(ws.nodes);
                    setEdges(ws.edges);
                    if (ws.sources?.length && documents.length === 0) {
                      setDocuments(
                        ws.sources.map((s) => ({
                          id: s.id,
                          name: s.fileName,
                          fileType: s.fileType,
                          sizeBytes: s.sizeBytes,
                          content: ws.redactedText,
                          status: { parsed: true, redactedLocally: true, graphIndexed: true },
                          timestamp: s.uploadedAt,
                        }))
                      );
                      setActiveDocumentId(ws.sources[0].id);
                    }
                    if (ws.cloudBriefing) setCloudBriefing(ws.cloudBriefing);
                    if (ws.audioUrl) setAudioUrl(ws.audioUrl);
                    if (ws.lastTelemetry) setLastTelemetry(ws.lastTelemetry);
                    setShowHistoryModal(false);
                  }}
                  uid={user.uid}
                />
              ) : (
                <p className="text-xs text-[#A1A1AA]">Sign in to view persistent vaults.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Polished Benchmark Modal */}
      <BenchmarkModal
        isOpen={showBenchmarkModal}
        onClose={() => setShowBenchmarkModal(false)}
        activeDocumentText={activeDocument?.content}
        isOnline={isOnline}
      />
    </div>
  );
}
