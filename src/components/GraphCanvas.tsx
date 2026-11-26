import React, { useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  MarkerType,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphNode, GraphEdge } from '../services/hybridAI';
import type { SourceDocument } from './SourceVault';
import {
  Search,
  Send,
  X,
  Cpu,
  Cloud,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Map as MapIcon,
  FileText,
  ArrowRight,
  Loader2,
  Network,
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

export interface LocalQAResponse {
  answer: string;
  executionSource: 'on-device' | 'cloud';
  latencyMs: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  documents: SourceDocument[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  onRunLocalQA: (question: string) => Promise<LocalQAResponse>;
  localExtractionLatencyMs: number;
  processingVault: boolean;
  onProcessVault: () => void;
}

const CATEGORY_ACCENTS: Record<string, { accent: string; pill: string; text: string }> = {
  Entity: { accent: '#10b981', pill: 'rgba(16, 185, 129, 0.12)', text: '#6ee7b7' },
  Concept: { accent: '#6366f1', pill: 'rgba(99, 102, 241, 0.14)', text: '#a5b4fc' },
  Claim: { accent: '#38bdf8', pill: 'rgba(56, 189, 248, 0.12)', text: '#7dd3fc' },
  Risk: { accent: '#f43f5e', pill: 'rgba(244, 63, 94, 0.14)', text: '#fda4af' },
  Evidence: { accent: '#f59e0b', pill: 'rgba(245, 158, 11, 0.12)', text: '#fcd34d' },
};

const GraphCanvasInner: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  documents,
  selectedNode,
  onSelectNode,
  onRunLocalQA,
  localExtractionLatencyMs,
  processingVault,
  onProcessVault,
}) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const [commandInput, setCommandInput] = useState('');
  const [dockMode, setDockMode] = useState<'ask' | 'filter'>('ask');
  const [showMinimap, setShowMinimap] = useState(false);
  const [qaAnswer, setQaAnswer] = useState<{
    q: string;
    a: string;
    executionSource?: 'on-device' | 'cloud';
    latencyMs?: number;
  } | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // Clean multi-ring / orbital layout so nodes have visual breathing room
  const flowNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const total = nodes.length;
    const filterTerm = dockMode === 'filter' ? commandInput.toLowerCase().trim() : '';

    return nodes.map((n, i) => {
      // Split across outer/inner orbits when > 10 nodes to prevent crowding
      const useTwoRings = total > 10;
      const ringIndex = useTwoRings ? i % 2 : 0;
      const ringNodesCount = useTwoRings
        ? ringIndex === 0
          ? Math.ceil(total / 2)
          : Math.floor(total / 2)
        : total;
      const posInRing = useTwoRings ? Math.floor(i / 2) : i;
      const radius = useTwoRings
        ? ringIndex === 0
          ? 240
          : 440
        : Math.max(220, total * 34);
      const angleOffset = ringIndex === 1 ? Math.PI / Math.max(1, ringNodesCount) : 0;
      const angle = (posInRing / Math.max(1, ringNodesCount)) * 2 * Math.PI + angleOffset;

      const x = 480 + radius * Math.cos(angle);
      const y = 340 + radius * Math.sin(angle);

      const theme = CATEGORY_ACCENTS[n.category] || CATEGORY_ACCENTS.Entity;
      const isSelected = selectedNode?.id === n.id;
      const isMatch = filterTerm
        ? n.label.toLowerCase().includes(filterTerm) ||
          n.summary.toLowerCase().includes(filterTerm) ||
          n.category.toLowerCase().includes(filterTerm)
        : true;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div
              onClick={() => onSelectNode(n)}
              className="flex items-stretch text-left select-none overflow-hidden rounded-[10px]"
            >
              {/* Thin 3px Left Accent Bar */}
              <div className="w-[3px] shrink-0" style={{ backgroundColor: theme.accent }} />
              <div className="px-3 py-2.5 flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: theme.pill, color: theme.text }}
                  >
                    {n.category}
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-[#A1A1AA]">
                    {Math.round((n.confidence || 0.95) * 100)}%
                  </span>
                </div>
                <div className="text-[13px] font-medium text-[#F4F4F5] leading-snug line-clamp-2">
                  {n.label}
                </div>
              </div>
            </div>
          ),
        },
        style: {
          background: '#18181B',
          border: isSelected
            ? '1px solid rgba(255, 255, 255, 0.45)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '11px',
          boxShadow: isSelected ? '0 0 0 2px rgba(255, 255, 255, 0.14)' : 'none',
          opacity: isMatch ? 1 : 0.25,
          padding: 0,
          cursor: 'pointer',
          width: 212,
        },
      };
    });
  }, [nodes, selectedNode, dockMode, commandInput, onSelectNode]);

  // Smooth curved edges with crisp rose/amber highlight for CONTRADICTS
  const flowEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) return [];

    return edges.map((e, idx) => {
      const isContradiction = e.relation === 'CONTRADICTS';
      let strokeColor = 'rgba(255, 255, 255, 0.22)';
      if (isContradiction) strokeColor = '#f43f5e';
      else if (e.relation === 'SUPPORTS') strokeColor = '#10b981';
      else if (e.relation === 'DEPENDS_ON') strokeColor = '#f59e0b';

      return {
        id: `e_${e.source}_${e.target}_${idx}`,
        source: e.source,
        target: e.target,
        type: 'default',
        label: e.relation,
        animated: isContradiction,
        style: {
          stroke: strokeColor,
          strokeWidth: isContradiction ? 2 : 1.25,
          strokeDasharray: isContradiction ? '5 4' : undefined,
        },
        labelStyle: {
          fill: isContradiction ? '#fda4af' : '#a1a1aa',
          fontWeight: isContradiction ? 600 : 500,
          fontSize: 9,
          letterSpacing: '0.04em',
        },
        labelBgStyle: {
          fill: isContradiction ? '#2a0a14' : '#111114',
          fillOpacity: 0.95,
          stroke: isContradiction ? 'rgba(244, 63, 94, 0.4)' : 'rgba(255, 255, 255, 0.08)',
          strokeWidth: 1,
        },
        labelBgPadding: [5, 2] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 14,
          height: 14,
        },
      };
    });
  }, [edges]);

  const handleDockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || dockMode !== 'ask') return;

    setQaLoading(true);
    try {
      const res = await onRunLocalQA(commandInput);
      setQaAnswer({
        q: commandInput,
        a: res.answer,
        executionSource: res.executionSource,
        latencyMs: res.latencyMs,
      });
    } catch (err: any) {
      setQaAnswer({ q: commandInput, a: `Q&A error: ${err.message}` });
    } finally {
      setQaLoading(false);
    }
  };

  // Resolve linked source document and connections for the selected node drawer
  const linkedSourceDoc = useMemo(() => {
    if (!selectedNode) return null;
    const match = selectedNode.id.match(/^d(\d+)_/);
    if (match) {
      const idx = Number(match[1]);
      return documents[idx] || null;
    }
    return documents[0] || null;
  }, [selectedNode, documents]);

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return [];
    return edges
      .filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
      .map((e) => {
        const otherId = e.source === selectedNode.id ? e.target : e.source;
        const otherNode = nodes.find((n) => n.id === otherId);
        return {
          relation: e.relation,
          direction: e.source === selectedNode.id ? 'outgoing' : 'incoming',
          otherLabel: otherNode?.label || otherId,
          otherNode: otherNode || null,
        };
      });
  }, [selectedNode, edges, nodes]);

  return (
    <div className="h-full min-h-0 w-full flex bg-[#09090B] relative overflow-hidden">
      {/* Main Canvas Area */}
      <div className="flex-1 min-h-0 min-w-0 h-full relative">
        {nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <div
              className="absolute inset-0 opacity-40 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(#27272A 1.2px, transparent 1.2px)',
                backgroundSize: '20px 20px',
              }}
            />
            <div className="relative z-10 max-w-md space-y-4 bg-[#111114] border border-white/[0.08] rounded-xl p-6">
              <div className="w-9 h-9 rounded-lg bg-[#18181B] border border-white/[0.08] flex items-center justify-center text-[#A1A1AA] mx-auto">
                {processingVault ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                ) : (
                  <Network className="w-4 h-4" />
                )}
              </div>
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold tracking-tight text-[#F4F4F5]">
                  {processingVault ? 'Extracting Knowledge Graph...' : 'Ready to Extract Graph'}
                </h3>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  {documents.length} source{documents.length === 1 ? '' : 's'} staged locally. Run
                  extraction to redact PII on-device and map entities and contradictions.
                </p>
              </div>
              {!processingVault && (
                <button
                  type="button"
                  onClick={onProcessVault}
                  className="px-4 py-2 rounded-lg bg-[#F4F4F5] hover:bg-white text-[#09090B] text-xs font-medium transition duration-150 cursor-pointer"
                >
                  Process Vault
                </button>
              )}
            </div>
          </div>
        ) : (
          <ErrorBoundary
            fallbackTitle="Graph Canvas Guard"
            fallbackMessage="An error occurred while rendering the knowledge graph."
          >
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.2}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
              onPaneClick={() => onSelectNode(null)}
            >
              <Background
                variant={BackgroundVariant.Dots}
                color="#27272A"
                gap={20}
                size={1.2}
              />
              {showMinimap && (
                <MiniMap
                  nodeColor={(n: any) => {
                    const matched = nodes.find((gn) => gn.id === n.id);
                    return CATEGORY_ACCENTS[matched?.category || 'Entity']?.accent || '#6366f1';
                  }}
                  maskColor="rgba(9, 9, 11, 0.75)"
                  position="top-right"
                />
              )}
            </ReactFlow>
          </ErrorBoundary>
        )}

        {/* Minimal Category Dot Legend (Top-Left of Canvas when nodes exist) */}
        {nodes.length > 0 && (
          <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-[#111114]/90 backdrop-blur-md border border-white/[0.08] text-[11px] text-[#A1A1AA] pointer-events-none">
            {Object.entries(CATEGORY_ACCENTS).map(([cat, col]) => (
              <span key={cat} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: col.accent }}
                />
                <span>{cat}</span>
              </span>
            ))}
            <span className="h-3 w-px bg-white/[0.08]" />
            <span className="inline-flex items-center gap-1.5 text-rose-400">
              <span className="w-3 h-0.5 bg-rose-500" />
              <span>Contradicts</span>
            </span>
          </div>
        )}

        {/* Floating Bottom Command Dock */}
        <div className="absolute bottom-5 left-4 right-4 z-20 flex flex-col items-center pointer-events-none">
          {/* Clean Floating Response Card right above Dock */}
          {qaAnswer && (
            <div className="pointer-events-auto mb-2.5 w-full max-w-xl bg-[#111114]/95 backdrop-blur-md border border-white/[0.1] rounded-xl p-4 shadow-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                    qaAnswer.executionSource === 'cloud' ? 'text-indigo-400' : 'text-emerald-400'
                  }`}
                >
                  {qaAnswer.executionSource === 'cloud' ? (
                    <Cloud className="w-3.5 h-3.5" />
                  ) : (
                    <Cpu className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {qaAnswer.executionSource === 'cloud'
                      ? 'Cloud Fallback Answer (Sanitized)'
                      : 'On-Device Answer (Zero Egress)'}
                  </span>
                  {qaAnswer.latencyMs !== undefined && (
                    <span className="font-mono tabular-nums text-[#A1A1AA]">
                      · {qaAnswer.latencyMs}ms
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setQaAnswer(null)}
                  className="text-[#A1A1AA] hover:text-[#F4F4F5] p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-xs font-medium text-[#F4F4F5]">{qaAnswer.q}</div>
              <div className="text-xs text-[#A1A1AA] leading-relaxed">{qaAnswer.a}</div>
            </div>
          )}

          {/* Command Dock Bar */}
          <form
            onSubmit={handleDockSubmit}
            className="pointer-events-auto w-full max-w-xl bg-[#111114]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-1.5 flex items-center gap-1.5 shadow-2xl"
          >
            {/* Compact Ask / Filter Toggle */}
            <div className="flex items-center bg-[#09090B] p-0.5 rounded-lg border border-white/[0.06] text-[11px] shrink-0">
              <button
                type="button"
                onClick={() => setDockMode('ask')}
                className={`px-2.5 py-1 rounded-md font-medium transition duration-150 cursor-pointer ${
                  dockMode === 'ask'
                    ? 'bg-[#18181B] text-[#F4F4F5]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                }`}
              >
                Ask
              </button>
              <button
                type="button"
                onClick={() => {
                  setDockMode('filter');
                  setQaAnswer(null);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition duration-150 cursor-pointer ${
                  dockMode === 'filter'
                    ? 'bg-[#18181B] text-[#F4F4F5]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5]'
                }`}
              >
                Filter
              </button>
            </div>

            <div className="relative flex-1 min-w-0">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder={
                  dockMode === 'ask'
                    ? 'Ask Local Vault...'
                    : 'Filter graph nodes by keyword...'
                }
                className="w-full bg-transparent text-xs text-[#F4F4F5] placeholder-[#A1A1AA] focus:outline-none px-2 py-1.5"
              />
              {commandInput && (
                <button
                  type="button"
                  onClick={() => {
                    setCommandInput('');
                    setQaAnswer(null);
                  }}
                  className="absolute right-1.5 top-1.5 text-[#A1A1AA] hover:text-[#F4F4F5] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {dockMode === 'ask' ? (
              <button
                type="submit"
                disabled={qaLoading || !commandInput.trim()}
                className="p-1.5 rounded-lg bg-[#18181B] hover:bg-white/[0.08] border border-white/[0.08] text-[#F4F4F5] transition duration-150 cursor-pointer disabled:opacity-40 shrink-0"
                title="Ask Local Vault"
              >
                {qaLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            ) : (
              <span className="p-1.5 text-[#A1A1AA] shrink-0">
                <Search className="w-3.5 h-3.5" />
              </span>
            )}

            <div className="h-4 w-px bg-white/[0.08] mx-0.5 shrink-0" />

            {/* Compact Canvas Controls: Zoom In, Zoom Out, Fit View, Minimap Toggle */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => zoomIn({ duration: 150 })}
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B] transition duration-150 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => zoomOut({ duration: 150 })}
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B] transition duration-150 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fitView({ duration: 200, padding: 0.2 })}
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B] transition duration-150 cursor-pointer"
                title="Fit View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowMinimap((prev) => !prev)}
                className={`p-1.5 rounded-lg transition duration-150 cursor-pointer ${
                  showMinimap
                    ? 'bg-[#18181B] text-[#F4F4F5]'
                    : 'text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B]'
                }`}
                title={showMinimap ? 'Hide Minimap' : 'Show Minimap'}
              >
                <MapIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Focused Slide-Over Node Inspector Drawer (360px on Right, only when selected) */}
      {selectedNode && (
        <aside className="w-full sm:w-[360px] shrink-0 h-full bg-[#111114] border-l border-white/[0.08] z-30 flex flex-col">
          <div className="px-5 py-4 border-b border-white/[0.08] flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <span
                className="inline-block text-[10px] font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: CATEGORY_ACCENTS[selectedNode.category]?.pill,
                  color: CATEGORY_ACCENTS[selectedNode.category]?.text,
                }}
              >
                {selectedNode.category}
              </span>
              <h3 className="text-sm font-semibold tracking-tight text-[#F4F4F5] leading-snug">
                {selectedNode.label}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onSelectNode(null)}
              className="p-1 rounded-lg text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#18181B] transition duration-150 cursor-pointer"
              title="Close Inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* Summary */}
            <div className="space-y-1.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Summary
              </h4>
              <p className="text-xs text-[#F4F4F5]/90 leading-relaxed">{selectedNode.summary}</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#18181B] border border-white/[0.08] rounded-lg p-3">
                <div className="text-[10px] text-[#A1A1AA]">Confidence</div>
                <div className="text-sm font-mono tabular-nums font-semibold text-emerald-400 mt-0.5">
                  {Math.round((selectedNode.confidence || 0.95) * 100)}%
                </div>
              </div>
              <div className="bg-[#18181B] border border-white/[0.08] rounded-lg p-3">
                <div className="text-[10px] text-[#A1A1AA]">Extraction Latency</div>
                <div className="text-sm font-mono tabular-nums font-semibold text-[#F4F4F5] mt-0.5">
                  {localExtractionLatencyMs}ms
                </div>
              </div>
            </div>

            {/* Linked Source Document */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Linked Source
              </h4>
              {linkedSourceDoc ? (
                <div className="bg-[#18181B] border border-white/[0.08] rounded-lg p-3 flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#F4F4F5] truncate">
                      {linkedSourceDoc.name}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-[#A1A1AA]">
                      {(linkedSourceDoc.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-[#A1A1AA]">Workspace index</div>
              )}
            </div>

            {/* Connected Edges */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                Relationships ({connectedEdges.length})
              </h4>
              {connectedEdges.length === 0 ? (
                <p className="text-xs text-[#A1A1AA]">No direct edges linked to this node.</p>
              ) : (
                <div className="space-y-1.5">
                  {connectedEdges.map((edge, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => edge.otherNode && onSelectNode(edge.otherNode)}
                      className="w-full text-left bg-[#18181B] hover:bg-white/[0.05] border border-white/[0.08] rounded-lg p-2.5 flex items-center justify-between gap-2 transition duration-150 cursor-pointer"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <span
                          className={`inline-block text-[9px] font-mono font-semibold uppercase ${
                            edge.relation === 'CONTRADICTS'
                              ? 'text-rose-400'
                              : edge.relation === 'SUPPORTS'
                              ? 'text-emerald-400'
                              : 'text-[#A1A1AA]'
                          }`}
                        >
                          {edge.direction === 'incoming' ? `← ${edge.relation}` : `${edge.relation} →`}
                        </span>
                        <div className="text-xs text-[#F4F4F5] truncate">{edge.otherLabel}</div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#A1A1AA] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

export const GraphCanvas: React.FC<GraphCanvasProps> = (props) => (
  <ReactFlowProvider>
    <GraphCanvasInner {...props} />
  </ReactFlowProvider>
);
