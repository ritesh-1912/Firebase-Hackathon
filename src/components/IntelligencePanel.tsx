import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Play,
  Pause,
  Download,
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
  Loader2,
  Sparkles,
} from 'lucide-react';

interface IntelligencePanelProps {
  view: 'firewall' | 'brief';
  originalText: string;
  redactedText: string;
  redactions: RedactionItem[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  cloudBriefing: CloudBriefing | null;
  isSynthesizing: boolean;
  onTriggerCloudSynthesis: () => Promise<void>;
  audioUrl?: string;
  audioUsedFallback?: boolean;
  isGeneratingAudio: boolean;
  onGenerateAudio: () => Promise<void>;
  isOnline: boolean;
  lastTelemetry: TelemetryResult | null;
  activeDocumentName?: string;
  onProcessVault: () => void;
  processingVault: boolean;
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  view,
  originalText,
  redactedText,
  redactions,
  nodes,
  edges,
  cloudBriefing,
  isSynthesizing,
  onTriggerCloudSynthesis,
  audioUrl,
  audioUsedFallback = false,
  isGeneratingAudio,
  onGenerateAudio,
  isOnline,
  activeDocumentName,
  onProcessVault,
  processingVault,
}) => {
  const [showWirePayload, setShowWirePayload] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  // Audio Player State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Match active document slice inside combined sanitized text for clean 1:1 diff when available
  const displayedSanitizedText = useMemo(() => {
    if (!redactedText) return '';
    if (!activeDocumentName) return redactedText;

    const marker = `--- [DOCUMENT: ${activeDocumentName}] ---`;
    const idx = redactedText.indexOf(marker);
    if (idx === -1) return redactedText;

    const afterMarker = redactedText.slice(idx + marker.length).replace(/^\n+/, '');
    const nextIdx = afterMarker.indexOf('\n--- [DOCUMENT:');
    return nextIdx === -1 ? afterMarker.trim() : afterMarker.slice(0, nextIdx).trim();
  }, [redactedText, activeDocumentName]);

  const redactionCounts = useMemo(
    () => ({
      total: redactions.length,
      person: redactions.filter((r) => r.type === 'PERSON').length,
      contact: redactions.filter((r) => r.type === 'CONTACT').length,
      financial: redactions.filter((r) => r.type === 'FINANCIAL').length,
      id: redactions.filter((r) => r.type === 'ID').length,
    }),
    [redactions]
  );

  const sanitizedWirePayload = useMemo(
    () => ({
      documentName: activeDocumentName || 'Active Workspace Session',
      sanitizedTextSample: redactedText.slice(0, 500) + (redactedText.length > 500 ? '...' : ''),
      piiInterceptionsCount: redactions.length,
      graphTopology: {
        nodesCount: nodes.length,
        edgesCount: edges.length,
        nodesSample: nodes.slice(0, 6).map((n) => ({
          id: n.id,
          label: n.label,
          category: n.category,
        })),
        edgesSample: edges.slice(0, 6).map((e) => ({
          source: e.source,
          target: e.target,
          relation: e.relation,
        })),
      },
      privacyAudit: 'Guaranteed ZERO raw PII transmitted to cloud synthesis.',
    }),
    [activeDocumentName, redactedText, redactions.length, nodes, edges]
  );

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(sanitizedWirePayload, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setAudioCurrentTime(audio.currentTime || 0);
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const handleLoadedMetadata = () => setAudioDuration(audio.duration || 0);
    const handleEnded = () => {
      setIsPlayingAudio(false);
      setAudioProgress(0);
      setAudioCurrentTime(0);
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
      audioRef.current.play().catch((err) => console.warn('Audio playback notice:', err));
      setIsPlayingAudio(true);
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    setAudioProgress(pct);
    if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = (pct / 100) * audioRef.current.duration;
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const formatSec = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderHighlightedSanitizedText = (text: string) => {
    if (!text) {
      return (
        <span className="text-[#A1A1AA] italic text-xs">
          Vault not yet processed. Run Process Vault to inspect locally sanitized output.
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
            className="inline-block bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-medium"
          >
            [REDACTED_PERSON]
          </span>
        );
      }
      if (part === '[REDACTED_CONTACT]') {
        return (
          <span
            key={idx}
            className="inline-block bg-sky-500/15 text-sky-300 border border-sky-500/30 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-medium"
          >
            [REDACTED_CONTACT]
          </span>
        );
      }
      if (part === '[REDACTED_FINANCIAL]') {
        return (
          <span
            key={idx}
            className="inline-block bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-medium"
          >
            [REDACTED_FINANCIAL]
          </span>
        );
      }
      if (part === '[REDACTED_ID]') {
        return (
          <span
            key={idx}
            className="inline-block bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded px-1.5 py-0.5 mx-0.5 text-[11px] font-mono font-medium"
          >
            [REDACTED_ID]
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // =========================================================
  // VIEW 1: PRIVACY FIREWALL FULL VIEW
  // =========================================================
  if (view === 'firewall') {
    return (
      <div className="flex-1 h-full overflow-y-auto bg-[#09090B]">
        <div className="max-w-6xl mx-auto p-6 lg:p-8 space-y-6">
          {/* View Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h1 className="text-lg font-semibold tracking-tight text-[#F4F4F5]">
                  Privacy Firewall
                </h1>
              </div>
              <p className="text-xs text-[#A1A1AA]">
                Sensitive PII is intercepted and tokenized locally before any cloud escalation.
              </p>
            </div>

            {!redactedText && (
              <button
                type="button"
                onClick={onProcessVault}
                disabled={processingVault}
                className="h-9 px-4 rounded-lg bg-[#F4F4F5] hover:bg-white text-[#09090B] text-xs font-medium transition duration-150 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {processingVault && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{processingVault ? 'Processing Vault...' : 'Process Vault'}</span>
              </button>
            )}
          </div>

          {/* Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total Blocked', value: redactionCounts.total, color: 'text-[#F4F4F5]' },
              { label: 'Persons', value: redactionCounts.person, color: 'text-amber-400' },
              { label: 'Contacts', value: redactionCounts.contact, color: 'text-sky-400' },
              { label: 'Financial', value: redactionCounts.financial, color: 'text-rose-400' },
              { label: 'Gov / Secret IDs', value: redactionCounts.id, color: 'text-emerald-400' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-[#111114] border border-white/[0.08] rounded-xl p-3.5"
              >
                <div className={`text-xl font-mono tabular-nums font-semibold ${stat.color}`}>
                  {stat.value}
                </div>
                <div className="text-[11px] text-[#A1A1AA] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Side-by-Side Split Diff */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-[#A1A1AA]">
              <span>
                Inspecting:{' '}
                <span className="font-mono text-[#F4F4F5]">
                  {activeDocumentName || 'Active Source'}
                </span>
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {redactions.length} total vault redactions
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left: Original Local Input */}
              <div className="bg-[#111114] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#18181B]/60">
                  <span className="text-xs font-medium text-[#F4F4F5]">Original Local Input</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                    Stays On-Device
                  </span>
                </div>
                <div className="p-4 max-h-[380px] overflow-y-auto text-xs font-mono text-[#A1A1AA] leading-relaxed whitespace-pre-wrap select-text">
                  {originalText || (
                    <span className="italic">Select a source document from the left sidebar.</span>
                  )}
                </div>
              </div>

              {/* Right: Sanitized Output */}
              <div className="bg-[#111114] border border-white/[0.08] rounded-xl overflow-hidden flex flex-col">
                <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between bg-[#18181B]/60">
                  <span className="text-xs font-medium text-[#F4F4F5]">Sanitized Output</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Cloud Safe
                  </span>
                </div>
                <div className="p-4 max-h-[380px] overflow-y-auto text-xs font-mono text-[#F4F4F5]/90 leading-relaxed whitespace-pre-wrap select-text">
                  {renderHighlightedSanitizedText(displayedSanitizedText)}
                </div>
              </div>
            </div>
          </div>

          {/* Intercepted PII Registry */}
          {redactions.length > 0 && (
            <div className="bg-[#111114] border border-white/[0.08] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                <h2 className="text-xs font-semibold text-[#F4F4F5]">
                  Blocked PII Items ({redactions.length})
                </h2>
                <span className="text-[11px] text-[#A1A1AA]">Tokenized prior to cloud egress</span>
              </div>
              <div className="divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
                {redactions.map((item, i) => (
                  <div
                    key={i}
                    className="px-4 py-2.5 flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] shrink-0">
                        {item.type}
                      </span>
                      <span className="text-[#A1A1AA] line-through truncate">
                        {item.originalSnippet}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ArrowRight className="w-3 h-3 text-[#A1A1AA]/60" />
                      <span className="text-emerald-400 text-[11px]">{item.replacement}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 2: CLOUD BRIEF FULL VIEW
  // =========================================================
  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#09090B]">
      <div className="max-w-5xl mx-auto p-6 lg:p-8 space-y-6">
        {/* Document Header & Run Cloud Synthesis Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-indigo-400" />
              <h1 className="text-lg font-semibold tracking-tight text-[#F4F4F5]">
                Executive Cloud Brief
              </h1>
            </div>
            <p className="text-xs text-[#A1A1AA]">
              Cross-document synthesis via Gemini 3.8 Flash using exclusively sanitized text and
              graph topology.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowWirePayload((prev) => !prev)}
              className="h-9 px-3 rounded-lg bg-[#111114] hover:bg-[#18181B] border border-white/[0.08] text-xs font-medium text-[#A1A1AA] hover:text-[#F4F4F5] inline-flex items-center gap-1.5 transition duration-150 cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>{showWirePayload ? 'Hide Payload' : 'Inspect Payload'}</span>
              {showWirePayload ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={onTriggerCloudSynthesis}
              disabled={isSynthesizing || !redactedText}
              className="h-9 px-4 rounded-lg bg-[#F4F4F5] hover:bg-white text-[#09090B] text-xs font-medium inline-flex items-center gap-2 transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSynthesizing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{cloudBriefing ? 'Re-run Cloud Synthesis' : 'Run Cloud Synthesis'}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Sanitized Payload Preview */}
        {showWirePayload && (
          <div className="bg-[#111114] border border-white/[0.08] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <Lock className="w-3.5 h-3.5" />
                <span>Sanitized Wire Payload (Zero Raw PII)</span>
              </span>
              <button
                type="button"
                onClick={handleCopyPayload}
                className="inline-flex items-center gap-1 text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
              >
                {copiedPayload ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedPayload ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <pre className="p-4 max-h-56 overflow-y-auto text-[11px] font-mono text-[#A1A1AA] leading-relaxed">
              {JSON.stringify(sanitizedWirePayload, null, 2)}
            </pre>
          </div>
        )}

        {/* Integrated Audio Briefing Player Bar at Top of Report */}
        <div className="bg-[#111114] border border-white/[0.08] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

          <div className="flex items-center gap-3 min-w-0">
            {audioUrl ? (
              <button
                type="button"
                onClick={toggleAudioPlay}
                className="w-9 h-9 rounded-full bg-[#F4F4F5] hover:bg-white text-[#09090B] flex items-center justify-center shrink-0 transition duration-150 cursor-pointer"
                title={isPlayingAudio ? 'Pause' : 'Play'}
              >
                {isPlayingAudio ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#18181B] border border-white/[0.08] text-[#A1A1AA] flex items-center justify-center shrink-0">
                <Volume2 className="w-4 h-4" />
              </div>
            )}

            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#F4F4F5]">Audio Briefing</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#18181B] border border-white/[0.08] text-[#A1A1AA]">
                  {audioUsedFallback || !isOnline
                    ? 'Web Speech Fallback'
                    : 'gemini-3.1-flash-tts-preview'}
                </span>
              </div>
              <p className="text-[11px] text-[#A1A1AA] truncate">
                {audioUrl
                  ? 'Studio executive narration ready for playback.'
                  : 'Generate spoken executive briefing from your sanitized summary.'}
              </p>
            </div>
          </div>

          {/* Scrubber when audioUrl exists */}
          {audioUrl && (
            <div className="flex items-center gap-3 flex-1 max-w-xs">
              <span className="text-[11px] font-mono tabular-nums text-[#A1A1AA] w-9 text-right">
                {formatSec(audioCurrentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={audioProgress}
                onChange={handleScrub}
                className="flex-1 h-1 bg-[#18181B] rounded-lg appearance-none cursor-pointer accent-[#F4F4F5]"
                aria-label="Audio progress"
              />
              <span className="text-[11px] font-mono tabular-nums text-[#A1A1AA] w-9">
                {audioDuration ? formatSec(audioDuration) : '--:--'}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {audioUrl && (
              <a
                href={audioUrl}
                download="synapsevault-executive-brief.wav"
                className="h-8 px-2.5 rounded-lg bg-[#18181B] hover:bg-white/[0.06] border border-white/[0.08] text-[11px] font-medium text-[#F4F4F5] inline-flex items-center gap-1.5 transition duration-150"
                title="Download WAV"
              >
                <Download className="w-3.5 h-3.5 text-[#A1A1AA]" />
                <span>WAV</span>
              </a>
            )}
            <button
              type="button"
              onClick={onGenerateAudio}
              disabled={isGeneratingAudio || (!cloudBriefing && !redactedText)}
              className="h-8 px-3 rounded-lg bg-[#18181B] hover:bg-white/[0.06] border border-white/[0.08] text-xs font-medium text-[#F4F4F5] inline-flex items-center gap-1.5 transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isGeneratingAudio ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>{audioUrl ? 'Regenerate' : 'Generate Audio'}</span>
              )}
            </button>
          </div>
        </div>

        {/* Synthesized Executive Report Body */}
        {cloudBriefing ? (
          <div className="space-y-5">
            {/* Executive Summary */}
            <section className="bg-[#111114] border border-white/[0.08] rounded-xl p-6 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA]">
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
                <span>Executive Summary</span>
              </div>
              <p className="text-sm text-[#F4F4F5]/95 leading-relaxed">
                {cloudBriefing.executiveSummary}
              </p>
            </section>

            {/* Detected Contradictions */}
            {cloudBriefing.contradictions && cloudBriefing.contradictions.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Detected Contradictions ({cloudBriefing.contradictions.length})</span>
                  </h2>
                </div>

                <div className="space-y-3">
                  {cloudBriefing.contradictions.map((c, i) => (
                    <div
                      key={i}
                      className="bg-[#111114] border border-white/[0.08] border-l-2 border-l-rose-500 rounded-xl p-5 space-y-3"
                    >
                      <div className="text-xs font-medium text-[#F4F4F5] leading-snug">
                        {c.conflictReason}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-[#18181B] border border-white/[0.06] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-[#A1A1AA] block">
                            Claim A
                          </span>
                          <span className="text-[#F4F4F5]/90 leading-relaxed block">
                            {c.claimA}
                          </span>
                        </div>
                        <div className="bg-[#18181B] border border-white/[0.06] rounded-lg p-3 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-[#A1A1AA] block">
                            Claim B
                          </span>
                          <span className="text-[#F4F4F5]/90 leading-relaxed block">
                            {c.claimB}
                          </span>
                        </div>
                      </div>

                      {c.citation && (
                        <div className="text-[11px] font-mono text-[#A1A1AA]">
                          Citation: {c.citation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Knowledge Gaps & Recommended Action Plan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cloudBriefing.knowledgeGaps && cloudBriefing.knowledgeGaps.length > 0 && (
                <section className="bg-[#111114] border border-white/[0.08] rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Knowledge Gaps</span>
                  </div>
                  <ul className="space-y-2.5 text-xs text-[#F4F4F5]/90 leading-relaxed">
                    {cloudBriefing.knowledgeGaps.map((gap, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <span>{gap}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {cloudBriefing.recommendedActions && cloudBriefing.recommendedActions.length > 0 && (
                <section className="bg-[#111114] border border-white/[0.08] rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                    <ListChecks className="w-3.5 h-3.5" />
                    <span>Action Plan</span>
                  </div>
                  <ul className="space-y-2.5 text-xs text-[#F4F4F5]/90 leading-relaxed">
                    {cloudBriefing.recommendedActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-[#111114] border border-white/[0.08] rounded-xl p-10 text-center space-y-3">
            <Cloud className="w-6 h-6 text-[#A1A1AA] mx-auto" />
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-[#F4F4F5]">No Cloud Synthesis Generated Yet</h3>
              <p className="text-xs text-[#A1A1AA] max-w-md mx-auto leading-relaxed">
                {redactedText
                  ? 'Click Run Cloud Synthesis above to escalate the sanitized knowledge graph for deep contradiction reasoning.'
                  : 'First process your sources locally in the Source Vault before escalating to Cloud Synthesis.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
