import React, { useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphNode, GraphEdge } from '../services/hybridAI';
import type { SourceDocument } from './SourceVault';
import { X, Loader2, ArrowUp } from 'lucide-react';
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
  activeDocumentId: string | null;
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  onRunLocalQA: (question: string) => Promise<LocalQAResponse>;
  processingVault: boolean;
  onProcessVault: () => void;
}

const CATEGORY_DOTS: Record<string, string> = {
  Entity: '#166534',
  Concept: '#1D4ED8',
  Claim: '#63635E',
  Risk: '#B91C1C',
  Evidence: '#B45309',
};

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  documents,
  activeDocumentId,
  selectedNode,
  onSelectNode,
  onRunLocalQA,
  processingVault,
  onProcessVault,
}) => {
  const [questionInput, setQuestionInput] = useState('');
  const [qaAnswer, setQaAnswer] = useState<{
    q: string;
    a: string;
    executionSource?: 'on-device' | 'cloud';
    latencyMs?: number;
  } | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  const activeDocIndex = useMemo(
    () => documents.findIndex((d) => d.id === activeDocumentId),
    [documents, activeDocumentId]
  );

  // Clean multi-ring node layout
  const flowNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const total = nodes.length;
    const activePrefix = activeDocIndex >= 0 ? `d${activeDocIndex}_` : '';

    return nodes.map((n, i) => {
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
          ? 220
          : 410
        : Math.max(200, total * 30);
      const angleOffset = ringIndex === 1 ? Math.PI / Math.max(1, ringNodesCount) : 0;
      const angle = (posInRing / Math.max(1, ringNodesCount)) * 2 * Math.PI + angleOffset;

      const x = 440 + radius * Math.cos(angle);
      const y = 320 + radius * Math.sin(angle);

      const dotColor = CATEGORY_DOTS[n.category] || '#63635E';
      const isSelected = selectedNode?.id === n.id;
      const belongsToActiveFile = activePrefix ? n.id.startsWith(activePrefix) : false;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div
              onClick={() => onSelectNode(n)}
              className="flex items-center gap-2 text-left select-none"
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: dotColor }}
              />
              <span className="text-[13px] font-medium text-[#141413] leading-snug line-clamp-2">
                {n.label}
              </span>
            </div>
          ),
        },
        style: {
          background: '#FFFFFF',
          border: isSelected
            ? '1.5px solid #141413'
            : belongsToActiveFile
            ? '1px solid #94948E'
            : '1px solid #DFDFD9',
          borderRadius: '6px',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
          padding: '8px 12px',
          cursor: 'pointer',
          maxWidth: 200,
          width: 'auto',
        },
      };
    });
  }, [nodes, selectedNode, activeDocIndex, onSelectNode]);

  // Thin #C8C8C0 bezier curves; CONTRADICTS in #B91C1C dashed
  const flowEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) return [];

    return edges.map((e, idx) => {
      const isContradiction = e.relation === 'CONTRADICTS';
      const strokeColor = isContradiction ? '#B91C1C' : '#C8C8C0';

      return {
        id: `e_${e.source}_${e.target}_${idx}`,
        source: e.source,
        target: e.target,
        type: 'default',
        label: isContradiction ? 'CONTRADICTS' : undefined,
        style: {
          stroke: strokeColor,
          strokeWidth: isContradiction ? 1.5 : 1,
          strokeDasharray: isContradiction ? '5 4' : undefined,
        },
        labelStyle: isContradiction
          ? {
              fill: '#B91C1C',
              fontWeight: 500,
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
            }
          : undefined,
        labelBgStyle: isContradiction
          ? {
              fill: '#FFFFFF',
              fillOpacity: 1,
              stroke: '#E6E6E2',
              strokeWidth: 1,
            }
          : undefined,
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
          width: 12,
          height: 12,
        },
      };
    });
  }, [edges]);

  const handleAskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionInput.trim()) return;

    setQaLoading(true);
    try {
      const res = await onRunLocalQA(questionInput);
      setQaAnswer({
        q: questionInput,
        a: res.answer,
        executionSource: res.executionSource,
        latencyMs: res.latencyMs,
      });
    } catch (err: any) {
      setQaAnswer({ q: questionInput, a: `Query error: ${err.message}` });
    } finally {
      setQaLoading(false);
    }
  };

  // Resolve linked source document and relationships for the slide-over inspector
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
    <div className="h-full min-h-0 w-full flex bg-[#FBFBF9] relative overflow-hidden">
      {/* Main Architectural Canvas */}
      <div className="flex-1 min-h-0 min-w-0 h-full relative">
        {nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center relative">
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'radial-gradient(#D8D8D2 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
            <div className="relative z-10 max-w-sm space-y-4">
              {processingVault ? (
                <div className="inline-flex items-center gap-2 text-[13px] text-[#63635E]">
                  <Loader2 className="w-4 h-4 animate-spin text-[#141413]" />
                  <span>Extracting entities and redacting locally...</span>
                </div>
              ) : (
                <>
                  <p className="text-[14px] text-[#63635E] leading-relaxed">
                    {documents.length} source{documents.length === 1 ? '' : 's'} staged. Extract
                    relationships and redact sensitive fields locally.
                  </p>
                  <button
                    type="button"
                    onClick={onProcessVault}
                    className="h-9 px-4 rounded-md bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] text-[13px] font-medium transition duration-150 cursor-pointer"
                  >
                    Extract &amp; redact
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <ErrorBoundary
            fallbackTitle="Graph Render Error"
            fallbackMessage="An error occurred while displaying the knowledge graph."
          >
            <ReactFlowProvider>
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                className="light"
                style={{ backgroundColor: '#FBFBF9', colorScheme: 'light' }}
                fitView
                minZoom={0.25}
                maxZoom={1.8}
                proOptions={{ hideAttribution: true }}
                onPaneClick={() => onSelectNode(null)}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  bgColor="#FBFBF9"
                  color="#D8D8D2"
                  gap={20}
                  size={1}
                />
              </ReactFlow>
            </ReactFlowProvider>
          </ErrorBoundary>
        )}

        {/* Bottom Spotlight Ask Bar & Floating Answer Popover */}
        <div className="absolute bottom-6 left-4 right-4 z-20 flex flex-col items-center pointer-events-none">
          {qaAnswer && (
            <div className="pointer-events-auto mb-3 w-full max-w-[460px] bg-[#FFFFFF] border border-[#E6E6E2] rounded-lg p-4 shadow-md space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="inline-flex items-center gap-1.5 text-[#63635E]">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor:
                        qaAnswer.executionSource === 'cloud' ? '#1D4ED8' : '#166534',
                    }}
                  />
                  <span>{qaAnswer.executionSource === 'cloud' ? 'Cloud' : 'Local'}</span>
                  {qaAnswer.latencyMs !== undefined && (
                    <span className="font-mono tabular-nums text-[#94948E]">
                      · {qaAnswer.latencyMs}ms
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setQaAnswer(null)}
                  className="text-[#94948E] hover:text-[#141413] cursor-pointer"
                  aria-label="Close answer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[13px] font-medium text-[#141413]">{qaAnswer.q}</p>
              <p className="text-[13px] text-[#63635E] leading-relaxed">{qaAnswer.a}</p>
            </div>
          )}

          <form
            onSubmit={handleAskSubmit}
            className="pointer-events-auto w-full max-w-[460px] bg-[#FFFFFF] border border-[#DFDFD9] focus-within:border-[#CFCFC9] rounded-full shadow-sm pl-4 pr-1.5 py-1.5 flex items-center gap-2 transition duration-150"
          >
            <input
              type="text"
              value={questionInput}
              onChange={(e) => setQuestionInput(e.target.value)}
              placeholder="Ask your local vault..."
              className="flex-1 min-w-0 bg-transparent text-[13px] text-[#141413] placeholder-[#94948E] focus:outline-none"
            />
            {questionInput && (
              <button
                type="button"
                onClick={() => {
                  setQuestionInput('');
                  setQaAnswer(null);
                }}
                className="text-[#94948E] hover:text-[#141413] p-1 cursor-pointer"
                aria-label="Clear query"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="submit"
              disabled={qaLoading || !questionInput.trim()}
              className="w-7 h-7 rounded-full bg-[#141413] hover:bg-[#2B2B29] text-[#FFFFFF] flex items-center justify-center transition duration-150 cursor-pointer disabled:opacity-30 shrink-0"
              aria-label="Submit question"
            >
              {qaLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Contextual Slide-Over Node Inspector (340px, opens only when a node is selected) */}
      {selectedNode && (
        <aside className="w-[340px] shrink-0 h-full bg-[#FFFFFF] border-l border-[#E6E6E2] z-30 flex flex-col">
          <div className="px-6 py-5 border-b border-[#E6E6E2] flex items-start justify-between gap-3">
            <div className="space-y-1.5 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[12px] text-[#63635E]">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    backgroundColor: CATEGORY_DOTS[selectedNode.category] || '#63635E',
                  }}
                />
                <span>{selectedNode.category}</span>
              </div>
              <h2 className="font-serif text-[20px] font-medium text-[#141413] leading-snug">
                {selectedNode.label}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onSelectNode(null)}
              className="text-[#94948E] hover:text-[#141413] p-1 transition duration-150 cursor-pointer"
              aria-label="Close inspector"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <div className="space-y-1.5">
              <div className="text-[12px] font-medium text-[#63635E]">Summary</div>
              <p className="text-[13px] text-[#141413] leading-relaxed">{selectedNode.summary}</p>
            </div>

            <div className="border-t border-[#E6E6E2] pt-5 space-y-1.5">
              <div className="text-[12px] font-medium text-[#63635E]">Linked source</div>
              <div className="text-[13px] text-[#141413]">
                {linkedSourceDoc ? linkedSourceDoc.name : 'Active workspace'}
              </div>
            </div>

            {connectedEdges.length > 0 && (
              <div className="border-t border-[#E6E6E2] pt-5 space-y-2.5">
                <div className="text-[12px] font-medium text-[#63635E]">
                  Connections ({connectedEdges.length})
                </div>
                <div className="divide-y divide-[#E6E6E2]">
                  {connectedEdges.map((edge, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => edge.otherNode && onSelectNode(edge.otherNode)}
                      className="w-full text-left py-2.5 flex flex-col gap-0.5 hover:bg-[#FBFBF9] transition duration-150 cursor-pointer"
                    >
                      <span
                        className={`text-[11px] font-mono ${
                          edge.relation === 'CONTRADICTS' ? 'text-[#B91C1C]' : 'text-[#94948E]'
                        }`}
                      >
                        {edge.direction === 'incoming'
                          ? `← ${edge.relation}`
                          : `${edge.relation} →`}
                      </span>
                      <span className="text-[13px] text-[#141413]">{edge.otherLabel}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
};
