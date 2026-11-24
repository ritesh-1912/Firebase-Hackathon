import React, { useState, useRef, useEffect } from 'react';
import type {
  RedactionItem,
  GraphNode,
  GraphEdge,
  CloudBriefing,
  TelemetryResult,
} from '../services/hybridAI';
import {
  ShieldCheck,
  Cloud,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  Sparkles,
  AlertTriangle,
  FileJson,
  ChevronDown,
  ChevronUp,
  Check,
  Copy,
  Lock,
  ArrowRight,
  ListChecks,
  Compass,
  AlertCircle,
  RefreshCw,
  Cpu,
} from 'lucide-react';

interface IntelligencePanelProps {
  originalText: string;
  redactedText: string;
  redactions: RedactionItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  cloudBriefing: CloudBriefing | null;
  isSynthesizing: boolean;
  onTriggerCloudSynthesis: () => Promise<void>;
  audioUrl?: string;
  isGeneratingAudio: boolean;
  onGenerateAudio: () => Promise<void>;
  isOnline: boolean;
  lastTelemetry: TelemetryResult | null;
  activeDocumentName?: string;
}

type TabType = 'firewall' | 'synthesis' | 'audio';

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  originalText,
  redactedText,
  redactions,
  nodes,
  edges,
  cloudBriefing,
  isSynthesizing,
  onTriggerCloudSynthesis,
  audioUrl,
  isGeneratingAudio,
  onGenerateAudio,
  isOnline,
  lastTelemetry,
  activeDocumentName,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('firewall');
  const [showPayloadModal, setShowPayloadModal] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Redaction counts by category
  const redactionCounts = {
    total: redactions.length,
    person: redactions.filter((r) => r.type === 'PERSON').length,
    contact: redactions.filter((r) => r.type === 'CONTACT').length,
    financial: redactions.filter((r) => r.type === 'FINANCIAL').length,
    id: redactions.filter((r) => r.type === 'ID').length,
  };

  // Sanitized payload preview that would be sent to cloud
  const sanitizedWirePayload = {
    documentName: activeDocumentName || 'Active Workspace Session',
    sanitizedTextSample: redactedText.slice(0, 500) + (redactedText.length > 500 ? '...' : ''),
    piiInterceptionsCount: redactions.length,
    graphTopology: {
      nodesCount: nodes.length,
      edgesCount: edges.length,
      nodesSample: nodes.slice(0, 5).map((n) => ({ id: n.id, label: n.label, category: n.category })),
      edgesSample: edges.slice(0, 5).map((e) => ({ source: e.source, target: e.target, relation: e.relation })),
    },
    privacyAudit: 'Guaranteed ZERO raw PII or unredacted credentials transmitted to cloud tiers.',
  };

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(sanitizedWirePayload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Audio Playback Effects
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const handleEnded = () => {
      setIsPlayingAudio(false);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  const toggleAudioPlay = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current.play().catch((err) => console.warn('Audio play error:', err));
      setIsPlayingAudio(true);
    }
  };

  // Helper function to render text with highlighted redaction badges
  const renderHighlightedSanitizedText = (text: string) => {
    if (!text) {
      return (
        <span className="text-slate-500 italic text-xs">
          No document content selected. Ingest a document or load the sample investigation to inspect.
        </span>
      );
    }

    const tokenRegex = /(\[REDACTED_(?:PERSON|CONTACT|FINANCIAL|ID)\])/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (part === '[REDACTED_PERSON]') {
        return (
          <span
            key={idx}
            className="inline-block bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-semibold"
            title="Redacted Person Name (Local Gemini Nano)"
          >
            👤 [PERSON]
          </span>
        );
      }
      if (part === '[REDACTED_CONTACT]') {
        return (
          <span
            key={idx}
            className="inline-block bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-semibold"
            title="Redacted Contact / Email / Phone (Local Gemini Nano)"
          >
            ✉️ [CONTACT]
          </span>
        );
      }
      if (part === '[REDACTED_FINANCIAL]') {
        return (
          <span
            key={idx}
            className="inline-block bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-semibold"
            title="Redacted Financial Card / Account (Local Gemini Nano)"
          >
            💳 [FINANCIAL]
          </span>
        );
      }
      if (part === '[REDACTED_ID]') {
        return (
          <span
            key={idx}
            className="inline-block bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-semibold"
            title="Redacted SSN / Government ID (Local Gemini Nano)"
          >
            🪪 [GOV_ID]
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border-l border-slate-800 text-slate-200">
      {/* Tab Navigation Header */}
      <div className="p-2 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('firewall')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md font-medium transition cursor-pointer ${
              activeTab === 'firewall'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">Privacy Firewall</span>
            {redactions.length > 0 && (
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-1 rounded-full font-mono">
                {redactions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('synthesis')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md font-medium transition cursor-pointer ${
              activeTab === 'synthesis'
                ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 text-cyan-300" />
            <span className="truncate">Cloud Synthesis</span>
            {cloudBriefing && (
              <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] px-1 rounded-full font-mono">
                Ready
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-md font-medium transition cursor-pointer ${
              activeTab === 'audio'
                ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">Audio Brief</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ========================================================= */}
        {/* TAB 1: PRIVACY FIREWALL */}
        {/* ========================================================= */}
        {activeTab === 'firewall' && (
          <div className="space-y-4">
            {/* Banner explaining Local Privacy Guarantee */}
            <div className="p-3 bg-gradient-to-r from-emerald-950/40 to-slate-900/60 border border-emerald-500/30 rounded-xl">
              <div className="flex items-start space-x-2.5">
                <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                    Tier 1 Local Privacy Firewall
                  </h4>
                  <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                    All PII, customer contacts, account numbers, and ID credentials are intercepted and
                    redacted <span className="font-semibold text-emerald-400">100% on-device</span> via
                    Gemini Nano prior to any cloud transmission.
                  </p>
                </div>
              </div>

              {/* Interception Counts Pill Bar */}
              <div className="grid grid-cols-4 gap-2 mt-3 pt-2 border-t border-emerald-500/20 text-[11px]">
                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-amber-400 font-bold font-mono text-xs">{redactionCounts.person}</div>
                  <div className="text-[10px] text-slate-400">Names</div>
                </div>
                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-sky-400 font-bold font-mono text-xs">{redactionCounts.contact}</div>
                  <div className="text-[10px] text-slate-400">Contacts</div>
                </div>
                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-rose-400 font-bold font-mono text-xs">{redactionCounts.financial}</div>
                  <div className="text-[10px] text-slate-400">Financial</div>
                </div>
                <div className="bg-slate-950/80 px-2 py-1.5 rounded-lg border border-slate-800 text-center">
                  <div className="text-emerald-400 font-bold font-mono text-xs">{redactionCounts.id}</div>
                  <div className="text-[10px] text-slate-400">Gov ID</div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Comparison: Raw vs Sanitized */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-300 flex items-center space-x-1.5">
                  <span>Redaction Diff Inspector</span>
                  {activeDocumentName && (
                    <span className="text-slate-400 font-mono text-[10px]">({activeDocumentName})</span>
                  )}
                </span>
                <span className="text-[10px] text-slate-400">
                  {redactions.length} tokens replaced locally
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Column 1: Raw Original Text */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <span className="text-[11px] font-bold text-rose-400 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      <span>Original Source (Raw)</span>
                    </span>
                    <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/40 px-1.5 py-0.5 rounded font-mono">
                      Stays Local
                    </span>
                  </div>
                  <div className="flex-1 max-h-64 overflow-y-auto text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-all">
                    {originalText || (
                      <span className="text-slate-500 italic">No document selected</span>
                    )}
                  </div>
                </div>

                {/* Column 2: Sanitized Local Output */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Sanitized Output</span>
                    </span>
                    <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.5 rounded font-mono">
                      Cloud Safe
                    </span>
                  </div>
                  <div className="flex-1 max-h-64 overflow-y-auto text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap select-all">
                    {renderHighlightedSanitizedText(redactedText)}
                  </div>
                </div>
              </div>
            </div>

            {/* List of Detected Redactions */}
            {redactions.length > 0 && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-2">
                <h5 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                  Intercepted PII Registry ({redactions.length})
                </h5>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {redactions.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs bg-slate-950/70 border border-slate-800/80 px-2.5 py-1.5 rounded-lg font-mono"
                    >
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                            item.type === 'PERSON'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : item.type === 'CONTACT'
                              ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                              : item.type === 'FINANCIAL'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {item.type}
                        </span>
                        <span className="text-slate-400 line-through truncate max-w-[140px]" title={item.originalSnippet}>
                          {item.originalSnippet}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className="text-emerald-400 text-[10px] font-bold">{item.replacement}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CLOUD SYNTHESIS */}
        {/* ========================================================= */}
        {activeTab === 'synthesis' && (
          <div className="space-y-4">
            {/* Cloud Escalation Trigger Banner */}
            <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900 border border-purple-500/30 rounded-xl space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-2.5">
                  <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg shrink-0 mt-0.5">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                      Tier 2 Cloud Escalation (Gemini 3.8 Flash)
                    </h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed mt-0.5">
                      Transmits <span className="font-semibold text-emerald-400">ONLY</span> sanitized text & graph topology
                      for deep cross-document contradiction reasoning.
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setShowPayloadModal(!showPayloadModal)}
                  className="flex items-center space-x-1 text-[10px] font-mono bg-slate-900/90 text-cyan-300 hover:text-cyan-200 border border-slate-700 px-2 py-1 rounded-lg transition"
                  title="View sanitized wire payload"
                >
                  <FileJson className="w-3 h-3 text-cyan-400" />
                  <span>{showPayloadModal ? 'Hide Wire JSON' : 'Inspect Wire JSON'}</span>
                  {showPayloadModal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>

              {/* Wire Payload Collapsible Preview */}
              {showPayloadModal && (
                <div className="bg-slate-950 border border-cyan-500/30 rounded-lg p-2.5 text-[10px] font-mono space-y-2">
                  <div className="flex items-center justify-between text-slate-400 pb-1.5 border-b border-slate-800">
                    <span className="flex items-center space-x-1 text-cyan-400 font-semibold">
                      <Lock className="w-3 h-3 text-emerald-400" />
                      <span>Wire Payload (Zero PII Transmitted)</span>
                    </span>
                    <button
                      onClick={handleCopyPayload}
                      className="flex items-center space-x-1 hover:text-slate-200 text-slate-400 transition"
                    >
                      {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <pre className="max-h-40 overflow-y-auto text-slate-300 text-[10px] leading-tight">
                    {JSON.stringify(sanitizedWirePayload, null, 2)}
                  </pre>
                </div>
              )}

              {/* Action Trigger Button */}
              <button
                onClick={onTriggerCloudSynthesis}
                disabled={isSynthesizing || !redactedText}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition flex items-center justify-center space-x-2 ${
                  isSynthesizing
                    ? 'bg-purple-900/60 text-purple-300 border border-purple-500/30 cursor-wait'
                    : !redactedText
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-600/30 cursor-pointer'
                }`}
              >
                {isSynthesizing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-purple-300" />
                    <span>Synthesizing via Gemini 3.8 Flash...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-cyan-300" />
                    <span>Trigger Tier 2 Cloud Escalation</span>
                  </>
                )}
              </button>
            </div>

            {/* Synthesized Output Display */}
            {cloudBriefing ? (
              <div className="space-y-4">
                {/* 1. Executive Summary */}
                <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
                    <Compass className="w-4 h-4" />
                    <span>Executive Summary</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed font-sans">
                    {cloudBriefing.executiveSummary}
                  </p>
                </div>

                {/* 2. Detected Contradictions (Flagged in high-contrast Amber/Red) */}
                {cloudBriefing.contradictions && cloudBriefing.contradictions.length > 0 && (
                  <div className="bg-rose-950/30 border border-rose-500/40 rounded-xl p-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                        <span>Flagged Contradictions ({cloudBriefing.contradictions.length})</span>
                      </div>
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                        High Severity
                      </span>
                    </div>

                    <div className="space-y-2">
                      {cloudBriefing.contradictions.map((c, i) => (
                        <div
                          key={i}
                          className="bg-slate-950/90 border border-rose-500/30 rounded-lg p-2.5 text-xs space-y-1.5"
                        >
                          <div className="flex items-baseline space-x-1.5 text-rose-300 font-semibold text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 mt-1" />
                            <span>Conflict: {c.conflictReason}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 text-slate-300 border-t border-slate-800/80">
                            <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Claim A</span>
                              <span>{c.claimA}</span>
                            </div>
                            <div className="bg-slate-900 p-1.5 rounded border border-slate-800">
                              <span className="text-slate-400 block text-[9px] uppercase">Claim B</span>
                              <span>{c.claimB}</span>
                            </div>
                          </div>
                          {c.citation && (
                            <div className="text-[10px] text-slate-400 italic">
                              Citation: {c.citation}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Knowledge Gaps */}
                {cloudBriefing.knowledgeGaps && cloudBriefing.knowledgeGaps.length > 0 && (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                      <AlertCircle className="w-4 h-4" />
                      <span>Knowledge Gaps & Open Inquiries</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {cloudBriefing.knowledgeGaps.map((gap, i) => (
                        <li key={i} className="flex items-start space-x-2">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{gap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 4. Action Plan */}
                {cloudBriefing.recommendedActions && cloudBriefing.recommendedActions.length > 0 && (
                  <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                      <ListChecks className="w-4 h-4" />
                      <span>Recommended Action Plan</span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-300">
                      {cloudBriefing.recommendedActions.map((action, i) => (
                        <li key={i} className="flex items-start space-x-2">
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 text-center space-y-2">
                <Cpu className="w-8 h-8 text-slate-600 mx-auto" />
                <h5 className="text-xs font-semibold text-slate-400">Cloud Synthesis Pending</h5>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Click the button above to escalate the sanitized graph and redacted data to Gemini 3.8 Flash.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: AUDIO BRIEFING */}
        {/* ========================================================= */}
        {activeTab === 'audio' && (
          <div className="space-y-4">
            {/* Header Card */}
            <div className="p-3.5 bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-cyan-500/20 text-cyan-300 rounded-lg">
                    <Volume2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Multimodal Audio Intelligence
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Powered by <span className="font-mono text-cyan-400">gemini-3.1-flash-tts-preview</span> (with browser fallback)
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
                    isOnline
                      ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                  }`}
                >
                  {isOnline ? 'Cloud TTS Active' : 'Offline Web Speech'}
                </span>
              </div>

              {/* Generate / Regenerate Button */}
              <button
                onClick={onGenerateAudio}
                disabled={isGeneratingAudio || (!cloudBriefing && !redactedText)}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition flex items-center justify-center space-x-2 ${
                  isGeneratingAudio
                    ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 cursor-wait'
                    : !cloudBriefing && !redactedText
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-cyan-600/30 cursor-pointer'
                }`}
              >
                {isGeneratingAudio ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                    <span>Synthesizing Voice Audio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{audioUrl ? 'Regenerate Audio Brief' : 'Generate Audio Briefing'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Audio Player & Waveform Visualizer */}
            {audioUrl ? (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
                <audio ref={audioRef} src={audioUrl} preload="metadata" />

                {/* Simulated Audio Waveform Bar */}
                <div className="flex items-center justify-between space-x-1 h-12 bg-slate-950/80 rounded-lg p-2 border border-slate-800/80">
                  {Array.from({ length: 32 }).map((_, idx) => {
                    const isActive = (idx / 32) * 100 <= audioProgress;
                    const randomHeight = isPlayingAudio
                      ? Math.max(20, Math.sin((idx + audioProgress) * 0.5) * 80 + 20)
                      : 25 + (idx % 5) * 10;

                    return (
                      <div
                        key={idx}
                        className={`w-1 rounded-full transition-all duration-100 ${
                          isActive
                            ? 'bg-gradient-to-t from-cyan-500 to-indigo-400'
                            : 'bg-slate-800'
                        }`}
                        style={{ height: `${randomHeight}%` }}
                      />
                    );
                  })}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-400 h-1.5 rounded-full transition-all duration-150"
                      style={{ width: `${audioProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-slate-400">
                    <span>
                      {audioRef.current
                        ? `${Math.floor(audioRef.current.currentTime || 0)}s`
                        : '0s'}
                    </span>
                    <span>
                      {audioDuration ? `${Math.floor(audioDuration)}s` : '--'}
                    </span>
                  </div>
                </div>

                {/* Playback Controls & Download */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={toggleAudioPlay}
                      className="p-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg shadow-cyan-600/30 transition cursor-pointer"
                      title={isPlayingAudio ? 'Pause' : 'Play'}
                    >
                      {isPlayingAudio ? (
                        <Pause className="w-4 h-4 fill-current" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      )}
                    </button>
                    <span className="text-xs font-medium text-slate-300">
                      {isPlayingAudio ? 'Playing Intelligence Brief' : 'Paused'}
                    </span>
                  </div>

                  <a
                    href={audioUrl}
                    download="synapsevault-executive-brief.wav"
                    className="flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-300 transition bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800"
                    title="Download audio briefing file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-6 text-center space-y-2">
                <VolumeX className="w-8 h-8 text-slate-600 mx-auto" />
                <h5 className="text-xs font-semibold text-slate-400">No Audio Generated Yet</h5>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                  Click 'Generate Audio Briefing' above to turn your executive synthesis into spoken intelligence.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Status Strip */}
      <div className="p-2.5 border-t border-slate-800 bg-slate-950/90 text-[10px] text-slate-400 flex items-center justify-between font-mono">
        <span className="flex items-center space-x-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              lastTelemetry?.executionSource === 'on-device' ? 'bg-emerald-400' : 'bg-purple-400'
            }`}
          />
          <span>Last Source: {lastTelemetry?.executionSource || 'None'}</span>
        </span>
        <span>Latency: {lastTelemetry ? `${lastTelemetry.latencyMs}ms` : '--'}</span>
      </div>
    </div>
  );
};
