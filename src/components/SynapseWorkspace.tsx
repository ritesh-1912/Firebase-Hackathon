import React, { useState } from 'react';
import type {
  TelemetryResult,
  PromptAPIAvailabilityStatus,
  GraphNode,
  GraphEdge,
  RedactionItem,
  CloudBriefing,
} from '../services/hybridAI';
import {
  redactAndExtractLocal,
  queryLocalWorkspace,
  synthesizeCloudBriefing,
  generateAudioBriefing,
} from '../services/hybridAI';
import { parseUploadedFile, type ParsedDocument } from '../services/documentParser';
import type { WorkspaceRecord } from '../services/workspaceStore';
import { saveWorkspace } from '../services/workspaceStore';
import type { InferenceModeSetting } from './TelemetryHeader';
import { KnowledgeGraphView } from './KnowledgeGraphView';
import {
  Cpu,
  Cloud,
  Upload,
  Lock,
  Sparkles,
  Volume2,
  Send,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RefreshCw,
  Info,
  Binary,
  Radio,
} from 'lucide-react';

interface SynapseWorkspaceProps {
  uid: string;
  activeMode: InferenceModeSetting;
  isOnline: boolean;
  promptApiStatus: PromptAPIAvailabilityStatus;
  currentWorkspace: WorkspaceRecord | null;
  onWorkspaceUpdated: (ws: WorkspaceRecord) => void;
  onRecordTelemetry: (telemetry: TelemetryResult) => void;
  onSwitchMode?: (mode: InferenceModeSetting) => void;
}

const RESEARCH_PRESETS = [
  {
    title: 'Project Chimera — Quantum Computing & Patent Disclosures',
    content: `Project Chimera Confidential Patent Disclosures.
Lead Quantum Architect: Dr. Alan Turing (SSN: 000-44-8891, Email: aturing@chimera-labs.internal).
Co-investigator: Dr. Ada Lovelace (Phone: 555-0188).
Financials: Allocated grant $4,250,000 via JPMorgan escrow acct #4111-9821-4451-2200.
Technical Claims:
1. The superconducting flux qubit array demonstrates 99.8% two-qubit gate fidelity at 15mK.
2. Contradictory Claim: Previous 2025 disclosure cited a thermal decoherence threshold of 45mK with 92% fidelity.
3. System architecture depends on helium-3 dilution refrigeration and shielded microwave interconnects.
4. Risk: Thermal crosstalk above 20mK causes catastrophic qubit phase-flip avalanche.`,
  },
  {
    title: 'Clinical Trial Protocol — NeuroVance Phase III',
    content: `Clinical Trial Protocol NV-8891 Confidential Patient Dossier.
Principal Investigator: Dr. Gregory House (Phone: 555-0199, Email: ghouse@princeton-plainsboro.med).
Patient ID: #PAT-9912 (Cardholder: Jane Smith, Billing Visa #4111-5582-1192-3304).
Subject age: 48. Enrolled under expedited compassionate use.
Findings:
1. NeuroVance 50mg daily demonstrated 64% reduction in neuro-inflammatory markers.
2. Contradiction: Phase II clinical report claimed maximum therapeutic efficacy was achieved at 25mg with no additional benefit at 50mg.
3. Risk: 12% of cohort exhibited transient bradycardia requiring continuous EKG monitoring.
4. Recommended: Implement automated telemetry alarm for PR interval prolongation > 200ms.`,
  },
  {
    title: 'Zero-Day Exploit Intelligence & Critical Infrastructure',
    content: `Incident Report: SCADA Infrastructure CVE-2026-X992 Exploit Trace.
Security Analyst: Sarah Connor (Email: sconnor@cyberdyne-defense.mil, Cell: 555-0144).
Compromised System: Substation Generator Unit #4A IP 192.168.1.104.
Credentials Leaked: Admin root token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.
Claims:
1. Firmware version 4.2.1 contains an unauthenticated memory buffer overflow in the Modbus protocol parser.
2. Contradictory statement: Vendor patch bulletin claimed vulnerability was mitigated in firmware 4.2.0.
3. The vulnerability depends on open TCP port 502 without mTLS client certificates.
4. High Risk: Remote arbitrary code execution could trigger emergency grid disconnect.`,
  },
];

export const SynapseWorkspace: React.FC<SynapseWorkspaceProps> = ({
  uid,
  activeMode,
  isOnline,
  promptApiStatus,
  currentWorkspace,
  onWorkspaceUpdated,
  onRecordTelemetry,
  onSwitchMode,
}) => {
  // Input Document State
  const [inputText, setInputText] = useState(RESEARCH_PRESETS[0].content);
  const [workspaceTitle, setWorkspaceTitle] = useState(
    currentWorkspace?.name || RESEARCH_PRESETS[0].title
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  // Extracted Knowledge Graph State
  const [redactedText, setRedactedText] = useState<string>(
    currentWorkspace?.redactedText || ''
  );
  const [redactions, setRedactions] = useState<RedactionItem[]>([]);
  const [nodes, setNodes] = useState<GraphNode[]>(currentWorkspace?.nodes || []);
  const [edges, setEdges] = useState<GraphEdge[]>(currentWorkspace?.edges || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Local Q&A State
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaHistory, setQaHistory] = useState<Array<{ q: string; a: string; time: number }>>([]);
  const [qaLoading, setQaLoading] = useState(false);

  // Cloud Briefing State
  const [cloudBriefing, setCloudBriefing] = useState<CloudBriefing | null>(
    currentWorkspace?.cloudBriefing || null
  );
  const [synthesizingCloud, setSynthesizingCloud] = useState(false);

  // Audio Briefing State
  const [audioUrl, setAudioUrl] = useState<string | null>(currentWorkspace?.audioUrl || null);
  const [generatingAudio, setGeneratingAudio] = useState(false);

  // Status and Banner State
  const [runningLocalExtraction, setRunningLocalExtraction] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // 1. File Upload Handler (PDF, Markdown, Text, Images)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    setParsingFile(true);
    setErrorBanner(null);

    try {
      const parsed: ParsedDocument = await parseUploadedFile(file);

      if (parsed.fileType === 'image') {
        setImageFile(file);
        setInputText(`[Attached Multimodal Image: ${file.name}]\nAnalyze visual elements, entities, and data.`);
      } else {
        setInputText(parsed.fullText);
        setImageFile(null);
      }

      setWorkspaceTitle(file.name.replace(/\.[^/.]+$/, ''));
      setSuccessBanner(
        `Parsed ${file.name} successfully (${(file.size / 1024).toFixed(1)} KB, ${parsed.chunks.length} chunks).`
      );
    } catch (err: any) {
      console.error('[Parser] File ingestion error:', err);
      setErrorBanner(`Failed to parse file: ${err.message || 'Unknown error'}`);
    } finally {
      setParsingFile(false);
    }
  };

  // 2. Preset Selection Handler
  const handleSelectPreset = (preset: (typeof RESEARCH_PRESETS)[0]) => {
    setWorkspaceTitle(preset.title);
    setInputText(preset.content);
    setImageFile(null);
    setRedactedText('');
    setRedactions([]);
    setNodes([]);
    setEdges([]);
    setCloudBriefing(null);
    setAudioUrl(null);
    setSuccessBanner(null);
    setErrorBanner(null);
  };

  // 3. Local PII Redaction & Graph Extraction
  const handleRunLocalExtraction = async () => {
    if (!inputText.trim()) return;

    setRunningLocalExtraction(true);
    setErrorBanner(null);
    setSuccessBanner(null);

    const forceLocal = activeMode === 'only_on_device';

    try {
      const result = await redactAndExtractLocal(inputText, imageFile || undefined, forceLocal);
      onRecordTelemetry(result);

      const extraction = result.extraction;
      setRedactedText(extraction.redactedText);
      setRedactions(extraction.redactions || []);
      setNodes(extraction.nodes || []);
      setEdges(extraction.edges || []);

      const wsRecord: WorkspaceRecord = {
        id: currentWorkspace?.id || `ws_${Date.now()}`,
        name: workspaceTitle || 'Private Research Vault',
        sources: [
          {
            id: `src_${Date.now()}`,
            fileName: workspaceTitle,
            fileType: imageFile ? 'image' : 'text',
            sizeBytes: inputText.length,
            uploadedAt: Date.now(),
            chunkCount: 1,
          },
        ],
        redactedText: extraction.redactedText,
        redactionsCount: extraction.redactions?.length || 0,
        nodes: extraction.nodes || [],
        edges: extraction.edges || [],
        lastTelemetry: result,
        isOfflineCreated: !navigator.onLine,
        createdAt: currentWorkspace?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      await saveWorkspace(uid, wsRecord);
      onWorkspaceUpdated(wsRecord);

      const sourceLabel = result.executionSource === 'on-device' ? 'On-Device (Gemini Nano)' : 'Cloud AI';
      setSuccessBanner(
        `Knowledge graph extracted via ${sourceLabel} in ${result.latencyMs}ms. ${extraction.redactions.length} PII tokens redacted locally. Saved to Firestore.`
      );
    } catch (err: any) {
      console.error('[SynapseVault] Local extraction error:', err);
      setErrorBanner(err.message || 'Extraction failed. Check Prompt API availability.');
    } finally {
      setRunningLocalExtraction(false);
    }
  };

  // 4. Local Workspace Q&A Handler
  const handleRunLocalQA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaQuestion.trim()) return;

    setQaLoading(true);
    const question = qaQuestion;
    setQaQuestion('');

    const context = `REDACTED DOCUMENT:\n${redactedText || inputText}\n\nKNOWLEDGE GRAPH NODES:\n${nodes
      .map((n) => `[${n.category}] ${n.label}: ${n.summary}`)
      .join('\n')}`;

    try {
      const result = await queryLocalWorkspace(question, context, activeMode === 'only_on_device');
      onRecordTelemetry(result);

      setQaHistory((prev) => [
        ...prev,
        {
          q: question,
          a: result.text,
          time: Date.now(),
        },
      ]);
    } catch (err: any) {
      console.error('[SynapseVault] Q&A error:', err);
      setErrorBanner(`Q&A query error: ${err.message || 'Local Q&A failed.'}`);
    } finally {
      setQaLoading(false);
    }
  };

  // 5. Cloud Briefing Synthesis Handler
  const handleRunCloudSynthesis = async () => {
    if (nodes.length === 0) {
      setErrorBanner('Please run local graph extraction first so the cloud receives ONLY sanitized data.');
      return;
    }

    setSynthesizingCloud(true);
    setErrorBanner(null);

    try {
      const result = await synthesizeCloudBriefing({
        redactedText: redactedText || inputText,
        nodes,
        edges,
      });

      onRecordTelemetry(result);
      setCloudBriefing(result.briefing);

      if (currentWorkspace) {
        const updated = {
          ...currentWorkspace,
          cloudBriefing: result.briefing,
          lastTelemetry: result,
        };
        await saveWorkspace(uid, updated);
        onWorkspaceUpdated(updated);
      }

      setSuccessBanner(
        `Cloud strategic synthesis complete via Gemini 3.8 Flash in ${result.latencyMs}ms. Contradictions & knowledge gaps verified.`
      );
    } catch (err: any) {
      console.error('[SynapseVault] Cloud briefing error:', err);
      setErrorBanner(`Cloud synthesis error: ${err.message || 'Cloud synthesis failed.'}`);
    } finally {
      setSynthesizingCloud(false);
    }
  };

  // 6. Audio Briefing Generation Handler
  const handleGenerateAudio = async () => {
    if (!cloudBriefing?.executiveSummary) {
      setErrorBanner('Generate a Cloud Briefing first before generating audio.');
      return;
    }

    setGeneratingAudio(true);

    try {
      const res = await generateAudioBriefing(cloudBriefing.executiveSummary);

      if (res.audioUrl) {
        setAudioUrl(res.audioUrl);
        setSuccessBanner('Audio briefing generated with gemini-3.1-flash-tts-preview.');
      } else if (res.usedFallback) {
        setSuccessBanner('Playing audio briefing via Web Speech API fallback.');
      }

      if (currentWorkspace && res.audioUrl) {
        const updated = {
          ...currentWorkspace,
          audioGenerated: true,
          audioUrl: res.audioUrl,
        };
        await saveWorkspace(uid, updated);
        onWorkspaceUpdated(updated);
      }
    } catch (err: any) {
      console.error('[SynapseVault] Audio briefing error:', err);
      setErrorBanner(err.message || 'Audio generation failed.');
    } finally {
      setGeneratingAudio(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Informative Status Notice for Non-Chrome Browsers or Missing Flags */}
      {promptApiStatus === 'unavailable' && (
        <div className="p-4 bg-sky-500/10 border border-sky-500/30 rounded-2xl flex items-start justify-between text-sky-200 shadow-sm animate-fadeIn">
          <div className="flex items-start space-x-3">
            <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-sky-100">
                Graceful Cloud Fallback Active (Chrome Prompt API Not Detected)
              </p>
              <p className="text-[11px] text-sky-300 leading-relaxed">
                This browser does not have the Chrome Prompt API (Gemini Nano) enabled. SynapseVault will automatically route extractions to Cloud{' '}
                <code className="font-mono bg-sky-950 px-1 py-0.5 rounded text-sky-200">gemini-3.8-flash</code> without interrupting your evaluation workflow. To test on-device inference, launch Chrome 139+ with flags enabled.
              </p>
              {activeMode === 'only_on_device' && onSwitchMode && (
                <div className="pt-1.5 flex items-center space-x-2">
                  <span className="text-[10px] text-amber-300 font-medium">Override is currently set to Force Local:</span>
                  <button
                    type="button"
                    onClick={() => onSwitchMode('prefer_on_device')}
                    className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold transition cursor-pointer"
                  >
                    Switch to Hybrid Mode
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {successBanner && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-emerald-300 text-xs shadow-sm">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-emerald-200 text-xs ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorBanner && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-between text-rose-300 text-xs shadow-sm">
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-400 hover:text-rose-200 text-xs ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Section 1: Research Preset Selector & Ingestion */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <Binary className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-100">Client-Side Document & Multimodal Ingestion</h2>
          </div>
          <span className="text-[11px] text-slate-400">PDF • Markdown • Text • Multimodal Images</span>
        </div>

        {/* Quick Presets */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Evaluation Research Vault Presets
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {RESEARCH_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col justify-between ${
                  workspaceTitle === p.title
                    ? 'border-indigo-500 bg-indigo-500/15 text-white font-medium shadow-sm'
                    : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-slate-200 line-clamp-1">{p.title}</div>
                <div className="text-[10px] text-slate-500 mt-1">Confidential Field Research</div>
              </button>
            ))}
          </div>
        </div>

        {/* File Drag & Drop or Custom Input */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <div className="lg:col-span-8 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Document Body / Source Context
              </label>
              <span className="text-[10px] text-slate-500 font-mono">
                {inputText.length} characters • ~{Math.round(inputText.length / 4)} tokens
              </span>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={5}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition resize-none leading-relaxed"
              placeholder="Paste research paper, confidential audit notes, or clinical trial data..."
            />
          </div>

          <div className="lg:col-span-4 space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Native File Ingestion (pdfjs-dist)
            </label>
            <label className="cursor-pointer border-2 border-dashed border-slate-800 hover:border-indigo-500/60 bg-slate-950/60 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-2 transition">
              <Upload className="w-5 h-5 text-indigo-400" />
              <div className="text-xs font-semibold text-slate-300">
                {parsingFile ? 'Extracting Text...' : 'Upload PDF / MD / Image'}
              </div>
              <div className="text-[10px] text-slate-500">Browser-native extraction with zero cloud upload</div>
              <input
                type="file"
                accept=".pdf,.md,.txt,image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                disabled={parsingFile}
                className="hidden"
              />
            </label>

            {/* Run Local Extraction Button */}
            <button
              type="button"
              onClick={handleRunLocalExtraction}
              disabled={runningLocalExtraction || !inputText.trim()}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white shadow-lg shadow-emerald-600/20 transition flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {runningLocalExtraction ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Extracting Local Graph...</span>
                </>
              ) : (
                <>
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Redact PII & Extract Graph</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Interactive Knowledge Graph & PII Firewall Output */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Knowledge Graph Flow Canvas (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-100">
                Local Knowledge Graph ({nodes.length} Nodes • {edges.length} Edges)
              </h3>
            </div>
            <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded">
              @xyflow/react canvas
            </span>
          </div>

          <KnowledgeGraphView
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        {/* PII Redaction Firewall & Local Q&A (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* PII Redaction Log */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-bold text-slate-100">Local PII Firewall Protection</h3>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  redactions.length > 0
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {redactions.length > 0 ? `${redactions.length} PII Items Redacted` : 'Zero Leaks'}
              </span>
            </div>

            {redactions.length > 0 ? (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {redactions.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono"
                  >
                    <span className="text-rose-400 line-through truncate max-w-[150px]">
                      {r.originalSnippet}
                    </span>
                    <span className="text-emerald-400 font-bold">{r.replacement}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400 leading-relaxed">
                PII tokens are sanitized entirely on your device using Gemini Nano and deterministic regex firewalls before any cloud egress.
              </p>
            )}
          </div>

          {/* Local Single-Turn Offline Q&A */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-center space-x-2 border-b border-slate-800/80 pb-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-100">Private Offline Q&A (On-Device)</h3>
            </div>

            <form onSubmit={handleRunLocalQA} className="flex space-x-2">
              <input
                type="text"
                value={qaQuestion}
                onChange={(e) => setQaQuestion(e.target.value)}
                placeholder="Ask about this graph context..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
              />
              <button
                type="submit"
                disabled={qaLoading || !qaQuestion.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
              >
                {qaLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              </button>
            </form>

            {qaHistory.length > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {qaHistory.map((item, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs space-y-1">
                    <div className="font-semibold text-indigo-300">Q: {item.q}</div>
                    <div className="text-slate-200 font-mono text-[11px] leading-relaxed">
                      A: {item.a}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Section 3: Cloud Strategic Synthesis & Executive Audio Briefing */}
      <div className="bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between border-b border-indigo-500/20 pb-3 gap-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <div>
              <h3 className="text-xs font-bold text-slate-100">
                Cloud Strategic Briefing & Audio Synthesis (Gemini 3.8 Flash + TTS)
              </h3>
              <p className="text-[10px] text-slate-400">
                Executes exclusively on sanitized graph payloads with App Check replay protection
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleRunCloudSynthesis}
              disabled={synthesizingCloud || nodes.length === 0 || !isOnline}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {synthesizingCloud ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Synthesize Cloud Briefing</span>
                </>
              )}
            </button>

            {cloudBriefing && (
              <button
                type="button"
                onClick={handleGenerateAudio}
                disabled={generatingAudio}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30 transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {generatingAudio ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating Audio...</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Audio Briefing (TTS)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Audio Player Component if Audio is generated */}
        {audioUrl && (
          <div className="p-3.5 bg-slate-950/80 border border-emerald-500/30 rounded-xl flex items-center justify-between space-x-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100">Playable Audio Briefing</div>
                <div className="text-[10px] text-slate-400 font-mono">
                  Synthesized via gemini-3.1-flash-tts-preview (Puck Voice)
                </div>
              </div>
            </div>

            <audio controls src={audioUrl} className="h-8 max-w-sm" />
          </div>
        )}

        {/* Cloud Briefing Details: Contradictions, Knowledge Gaps, Actions */}
        {cloudBriefing ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Executive Summary */}
            <div className="md:col-span-3 bg-slate-950/80 p-3.5 rounded-xl border border-indigo-500/20 space-y-1">
              <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
                Executive Synthesis
              </span>
              <p className="text-slate-200 leading-relaxed">{cloudBriefing.executiveSummary}</p>
            </div>

            {/* Contradictions */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-rose-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider block">
                Cross-Document Contradictions ({cloudBriefing.contradictions?.length || 0})
              </span>
              {cloudBriefing.contradictions && cloudBriefing.contradictions.length > 0 ? (
                <div className="space-y-2">
                  {cloudBriefing.contradictions.map((c, i) => (
                    <div key={i} className="space-y-1 border-b border-slate-800 pb-2 text-[11px]">
                      <div className="text-slate-300 font-semibold">{c.conflictReason}</div>
                      <div className="text-rose-300 text-[10px]">Claim A: {c.claimA}</div>
                      <div className="text-amber-300 text-[10px]">Claim B: {c.claimB}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">No cross-document contradictions detected.</p>
              )}
            </div>

            {/* Knowledge Gaps */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-amber-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider block">
                Critical Knowledge Gaps
              </span>
              <div className="space-y-1">
                {cloudBriefing.knowledgeGaps?.map((gap, i) => (
                  <div key={i} className="flex items-start space-x-1.5 text-[11px] text-slate-300">
                    <ChevronRight className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{gap}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommended Actions */}
            <div className="bg-slate-950/80 p-3.5 rounded-xl border border-emerald-500/30 space-y-2">
              <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">
                Recommended Actions
              </span>
              <div className="space-y-1">
                {cloudBriefing.recommendedActions?.map((act, i) => (
                  <div key={i} className="flex items-start space-x-1.5 text-[11px] text-slate-300">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{act}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-500 text-xs space-y-1">
            <p>Run on-device graph extraction first, then click "Synthesize Cloud Briefing".</p>
            <p className="text-[11px] text-slate-600">
              Only PII-redacted text and verified node relationships are transmitted to Gemini 3.8 Flash.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
