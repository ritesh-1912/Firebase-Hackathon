import React, { useState, useRef, useEffect, useMemo } from 'react';
import type {
  RedactionItem,
  GraphNode,
  GraphEdge,
  CloudBriefing,
} from '../services/hybridAI';
import type { SourceDocument } from './SourceVault';
import { Play, Pause, Download, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';

interface IntelligencePanelProps {
  view: 'redactions' | 'briefing';
  documents: SourceDocument[];
  activeDocumentId: string | null;
  onSelectDocument: (doc: SourceDocument) => void;
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
  onProcessVault: () => void;
  processingVault: boolean;
}

export const IntelligencePanel: React.FC<IntelligencePanelProps> = ({
  view,
  documents,
  activeDocumentId,
  onSelectDocument,
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
  onProcessVault,
  processingVault,
}) => {
  const [showPayload, setShowPayload] = useState(false);

  // Audio player state
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeDoc = documents.find((d) => d.id === activeDocumentId) || documents[0];

  // Match active document's section from combined sanitized text
  const displayedSanitizedText = useMemo(() => {
    if (!redactedText) return '';
    if (!activeDoc) return redactedText;

    const marker = `--- [DOCUMENT: ${activeDoc.name}] ---`;
    const idx = redactedText.indexOf(marker);
    if (idx === -1) return redactedText;

    const afterMarker = redactedText.slice(idx + marker.length).replace(/^\n+/, '');
    const nextIdx = afterMarker.indexOf('\n--- [DOCUMENT:');
    return nextIdx === -1 ? afterMarker.trim() : afterMarker.slice(0, nextIdx).trim();
  }, [redactedText, activeDoc]);

  const sanitizedWirePayload = useMemo(
    () => ({
      documentName: activeDoc?.name || 'Workspace Session',
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
    }),
    [activeDoc?.name, redactedText, redactions.length, nodes, edges]
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      setAudioCurrentTime(audio.currentTime || 0);
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onLoadedMetadata = () => setAudioDuration(audio.duration || 0);
    const onEnded = () => {
      setIsPlayingAudio(false);
      setAudioProgress(0);
      setAudioCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
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

  const renderSanitizedProse = (text: string) => {
    if (!text) {
      return (
        <span className="text-[#94948E] italic">
          Run extraction first to generate sanitized text.
        </span>
      );
    }

    const tokenRegex = /(\[REDACTED_(?:PERSON|CONTACT|FINANCIAL|ID)\])/g;
    const parts = text.split(tokenRegex);

    return parts.map((part, idx) => {
      if (part.startsWith('[REDACTED_') && part.endsWith(']')) {
        return (
          <span
            key={idx}
            className="inline-block bg-[#141413] text-[#FBFBF9] font-mono text-[12px] px-1.5 py-0.5 mx-0.5 rounded-[3px] align-baseline"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // =========================================================
  // VIEW 1: REDACTIONS TAB
  // =========================================================
  if (view === 'redactions') {
    return (
      <div className="flex-1 h-full overflow-y-auto bg-[#FBFBF9]">
        <div className="max-w-5xl mx-auto px-8 py-8 space-y-6">
          {/* Single-line Header Summary + Document Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6E6E2] pb-5">
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-medium text-[#141413]">Local Redactions</h1>
              <p className="text-[13px] text-[#63635E]">
                <span className="font-mono tabular-nums text-[#141413]">{redactions.length}</span>{' '}
                sensitive {redactions.length === 1 ? 'item' : 'items'} blocked locally before cloud
                sync
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {documents.length > 1 && (
                <select
                  value={activeDoc?.id || ''}
                  onChange={(e) => {
                    const chosen = documents.find((d) => d.id === e.target.value);
                    if (chosen) onSelectDocument(chosen);
                  }}
                  aria-label="Select document to inspect"
                  className="h-8 px-2.5 rounded-md border border-[#E6E6E2] hover:border-[#CFCFC9] bg-[#FFFFFF] text-[13px] text-[#141413] focus:outline-none cursor-pointer"
                >
                  {documents.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name}
                    </option>
                  ))}
                </select>
              )}

              {!redactedText && documents.length > 0 && (
                <button
                  type="button"
                  onClick={onProcessVault}
                  disabled={processingVault}
                  className="h-8 px-3.5 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium inline-flex items-center gap-2 transition duration-150 cursor-pointer disabled:opacity-50"
                >
                  {processingVault && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{processingVault ? 'Processing...' : 'Extract & redact'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Spacious Two-Column Reading Layout separated by a 1px hairline divider */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[#E6E6E2]">
            <div className="pb-6 lg:pb-0 lg:pr-8 space-y-3">
              <div className="text-[12px] font-medium text-[#63635E]">Original on device</div>
              <div className="text-[13px] leading-relaxed text-[#63635E] whitespace-pre-wrap font-mono select-text">
                {activeDoc?.content || 'No document selected.'}
              </div>
            </div>

            <div className="pt-6 lg:pt-0 lg:pl-8 space-y-3">
              <div className="text-[12px] font-medium text-[#166534]">Sanitized for cloud</div>
              <div className="text-[13px] leading-relaxed text-[#141413] whitespace-pre-wrap font-mono select-text">
                {renderSanitizedProse(displayedSanitizedText)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // VIEW 2: BRIEFING TAB
  // =========================================================
  return (
    <div className="flex-1 h-full overflow-y-auto bg-[#FBFBF9]">
      <div className="max-w-2xl mx-auto px-8 py-10 space-y-8">
        {!cloudBriefing ? (
          <div className="py-12 space-y-6">
            <div className="space-y-2">
              <h1 className="font-serif text-3xl font-medium text-[#141413]">
                Sanitized Executive Briefing
              </h1>
              <p className="text-[14px] text-[#63635E] leading-relaxed">
                Synthesize contradictions, knowledge gaps, and recommended actions via Gemini 3.8
                Flash using exclusively redacted text and graph topology.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={onTriggerCloudSynthesis}
                disabled={isSynthesizing || !redactedText}
                className="h-9 px-4 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium inline-flex items-center gap-2 transition duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSynthesizing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSynthesizing ? 'Synthesizing...' : 'Generate cloud briefing'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPayload((prev) => !prev)}
                className="text-[13px] text-[#63635E] hover:text-[#141413] inline-flex items-center gap-1 transition duration-150 cursor-pointer"
              >
                <span>Inspect sanitized payload</span>
                {showPayload ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!redactedText && (
              <p className="text-[13px] text-[#94948E]">
                Extract and redact your staged sources before generating a cloud briefing.
              </p>
            )}

            {showPayload && (
              <pre className="p-4 bg-[#FFFFFF] border border-[#E6E6E2] rounded-md text-[12px] font-mono text-[#63635E] overflow-x-auto max-h-64 leading-relaxed">
                {JSON.stringify(sanitizedWirePayload, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <article className="space-y-8">
            {/* Serif Memo Header */}
            <header className="space-y-3 border-b border-[#E6E6E2] pb-6">
              <h1 className="font-serif text-3xl font-medium tracking-tight text-[#141413]">
                Investigation Synthesis Memorandum
              </h1>
              <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#63635E]">
                <span>Synthesized via Gemini 3.8 Flash · Sanitized inputs only</span>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setShowPayload((prev) => !prev)}
                    className="hover:text-[#141413] underline underline-offset-4 cursor-pointer"
                  >
                    {showPayload ? 'Hide sanitized payload' : 'Inspect sanitized payload'}
                  </button>
                  <button
                    type="button"
                    onClick={onTriggerCloudSynthesis}
                    disabled={isSynthesizing}
                    className="hover:text-[#141413] underline underline-offset-4 cursor-pointer disabled:opacity-50"
                  >
                    {isSynthesizing ? 'Refreshing...' : 'Regenerate'}
                  </button>
                </div>
              </div>

              {showPayload && (
                <pre className="mt-3 p-4 bg-[#FFFFFF] border border-[#E6E6E2] rounded-md text-[12px] font-mono text-[#63635E] overflow-x-auto max-h-56 leading-relaxed">
                  {JSON.stringify(sanitizedWirePayload, null, 2)}
                </pre>
              )}
            </header>

            {/* Minimal Inline Audio Briefing Bar */}
            <div className="py-3 px-4 bg-[#FFFFFF] border border-[#E6E6E2] rounded-md flex flex-wrap items-center justify-between gap-4">
              {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" />}

              <div className="flex items-center gap-3 min-w-0">
                {audioUrl ? (
                  <button
                    type="button"
                    onClick={toggleAudioPlay}
                    className="w-8 h-8 rounded-full bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] flex items-center justify-center shrink-0 transition duration-150 cursor-pointer"
                    aria-label={isPlayingAudio ? 'Pause briefing' : 'Play briefing'}
                  >
                    {isPlayingAudio ? (
                      <Pause className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onGenerateAudio}
                    disabled={isGeneratingAudio}
                    className="h-8 px-3 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[12px] font-medium inline-flex items-center gap-1.5 transition duration-150 cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingAudio && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{isGeneratingAudio ? 'Generating audio...' : 'Play audio briefing'}</span>
                  </button>
                )}

                <span className="text-[12px] text-[#63635E] font-mono">
                  {audioUsedFallback || !isOnline
                    ? 'Web Speech fallback'
                    : 'gemini-3.1-flash-tts-preview'}
                </span>
              </div>

              {audioUrl && (
                <div className="flex items-center gap-3 flex-1 min-w-[180px]">
                  <span className="text-[11px] font-mono tabular-nums text-[#63635E]">
                    {formatSec(audioCurrentTime)}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={audioProgress}
                    onChange={handleScrub}
                    aria-label="Audio scrubber"
                    className="flex-1 h-px bg-[#E6E6E2] appearance-none cursor-pointer accent-[#141413]"
                  />
                  <span className="text-[11px] font-mono tabular-nums text-[#63635E]">
                    {audioDuration ? formatSec(audioDuration) : '--:--'}
                  </span>
                  <a
                    href={audioUrl}
                    download="synapsevault-briefing.wav"
                    className="text-[#63635E] hover:text-[#141413] p-1 transition duration-150"
                    title="Download WAV"
                    aria-label="Download audio briefing"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Section 1: Executive Summary */}
            <section className="space-y-3">
              <h2 className="font-serif text-xl font-medium text-[#141413]">Executive Summary</h2>
              <p className="text-[14px] text-[#141413] leading-relaxed">
                {cloudBriefing.executiveSummary}
              </p>
            </section>

            {/* Section 2: Detected Contradictions (2px #B91C1C left border) */}
            {cloudBriefing.contradictions && cloudBriefing.contradictions.length > 0 && (
              <section className="border-t border-[#E6E6E2] pt-8 space-y-5">
                <h2 className="font-serif text-xl font-medium text-[#141413]">
                  Detected Contradictions
                </h2>
                <div className="space-y-6">
                  {cloudBriefing.contradictions.map((c, i) => (
                    <div key={i} className="border-l-2 border-[#B91C1C] pl-4 space-y-2.5">
                      <p className="text-[14px] font-medium text-[#141413] leading-snug">
                        {c.conflictReason}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px] text-[#63635E]">
                        <div>
                          <span className="block text-[11px] font-mono text-[#94948E] mb-1">
                            Claim A
                          </span>
                          <span className="leading-relaxed">{c.claimA}</span>
                        </div>
                        <div>
                          <span className="block text-[11px] font-mono text-[#94948E] mb-1">
                            Claim B
                          </span>
                          <span className="leading-relaxed">{c.claimB}</span>
                        </div>
                      </div>
                      {c.citation && (
                        <div className="text-[12px] font-mono text-[#94948E]">
                          Source: {c.citation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Section 3: Knowledge Gaps */}
            {cloudBriefing.knowledgeGaps && cloudBriefing.knowledgeGaps.length > 0 && (
              <section className="border-t border-[#E6E6E2] pt-8 space-y-3">
                <h2 className="font-serif text-xl font-medium text-[#141413]">Knowledge Gaps</h2>
                <ul className="list-disc pl-5 space-y-2 text-[14px] text-[#141413] leading-relaxed">
                  {cloudBriefing.knowledgeGaps.map((gap, i) => (
                    <li key={i}>{gap}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Section 4: Recommended Actions */}
            {cloudBriefing.recommendedActions && cloudBriefing.recommendedActions.length > 0 && (
              <section className="border-t border-[#E6E6E2] pt-8 space-y-3">
                <h2 className="font-serif text-xl font-medium text-[#141413]">
                  Recommended Actions
                </h2>
                <ol className="list-decimal pl-5 space-y-2 text-[14px] text-[#141413] leading-relaxed">
                  {cloudBriefing.recommendedActions.map((action, i) => (
                    <li key={i}>{action}</li>
                  ))}
                </ol>
              </section>
            )}
          </article>
        )}
      </div>
    </div>
  );
};
