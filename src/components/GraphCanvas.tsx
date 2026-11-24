import React, { useState, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphNode, GraphEdge } from '../services/hybridAI';
import {
  Search,
  Send,
  X,
  Cpu,
  Binary,
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  onSelectNode: (node: GraphNode | null) => void;
  onRunLocalQA: (question: string) => Promise<string>;
  localExtractionLatencyMs: number;
}

const CATEGORY_THEMES: Record<
  string,
  { bg: string; border: string; text: string; glow: string }
> = {
  Entity: { bg: '#064e3b', border: '#10b981', text: '#6ee7b7', glow: 'rgba(16, 185, 129, 0.3)' },
  Concept: { bg: '#1e1b4b', border: '#6366f1', text: '#a5b4fc', glow: 'rgba(99, 102, 241, 0.3)' },
  Claim: { bg: '#082f49', border: '#0ea5e9', text: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.3)' },
  Risk: { bg: '#4c0519', border: '#f43f5e', text: '#fda4af', glow: 'rgba(244, 63, 94, 0.4)' },
  Evidence: { bg: '#451a03', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245, 158, 11, 0.3)' },
};

export const GraphCanvas: React.FC<GraphCanvasProps> = ({
  nodes,
  edges,
  selectedNode,
  onSelectNode,
  onRunLocalQA,
  localExtractionLatencyMs,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [qaMode, setQaMode] = useState(false);
  const [qaAnswer, setQaAnswer] = useState<{ q: string; a: string } | null>(null);
  const [qaLoading, setQaLoading] = useState(false);

  // Position nodes with an orbital spring distribution
  const flowNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const total = nodes.length;
    const radius = Math.max(180, total * 32);
    const centerX = 360;
    const centerY = 280;

    const lowerQuery = searchQuery.toLowerCase().trim();

    return nodes.map((n, i) => {
      const angle = (i / total) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      const theme = CATEGORY_THEMES[n.category] || CATEGORY_THEMES.Entity;
      const isSelected = selectedNode?.id === n.id;
      const isMatch = lowerQuery
        ? n.label.toLowerCase().includes(lowerQuery) ||
          n.summary.toLowerCase().includes(lowerQuery)
        : true;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div
              className="p-2.5 text-left space-y-1 select-none"
              onClick={() => onSelectNode(n)}
            >
              <div className="flex items-center justify-between text-[9px] uppercase font-bold tracking-wider">
                <span style={{ color: theme.text }}>{n.category}</span>
                <span className="text-slate-400 font-mono">
                  {Math.round((n.confidence || 0.95) * 100)}%
                </span>
              </div>
              <div className="font-bold text-xs text-white leading-tight">{n.label}</div>
              {n.summary && (
                <div className="text-[10px] text-slate-300 line-clamp-2 leading-tight">
                  {n.summary}
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: theme.bg,
          border: `2px solid ${isSelected ? '#ffffff' : theme.border}`,
          borderRadius: '14px',
          boxShadow: isSelected
            ? '0 0 20px rgba(255, 255, 255, 0.6)'
            : isMatch
            ? `0 4px 14px ${theme.glow}`
            : '0 2px 6px rgba(0,0,0,0.4)',
          opacity: isMatch ? 1 : 0.25,
          padding: '2px',
          cursor: 'pointer',
          width: 200,
          transition: 'all 0.2s ease',
        },
      };
    });
  }, [nodes, selectedNode, searchQuery, onSelectNode]);

  // High-contrast highlighting for CONTRADICTS edges
  const flowEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) return [];

    return edges.map((e, idx) => {
      const isContradiction = e.relation === 'CONTRADICTS';

      let strokeColor = '#64748b';
      if (isContradiction) strokeColor = '#f43f5e';
      else if (e.relation === 'SUPPORTS') strokeColor = '#10b981';
      else if (e.relation === 'DEPENDS_ON') strokeColor = '#f59e0b';
      else strokeColor = '#818cf8';

      return {
        id: `e_${e.source}_${e.target}_${idx}`,
        source: e.source,
        target: e.target,
        label: e.relation,
        animated: isContradiction || e.relation === 'DEPENDS_ON',
        style: {
          stroke: strokeColor,
          strokeWidth: isContradiction ? 3.5 : 2,
          strokeDasharray: isContradiction ? '5 5' : undefined,
        },
        labelStyle: {
          fill: isContradiction ? '#fecdd3' : strokeColor,
          fontWeight: 800,
          fontSize: isContradiction ? 11 : 9,
          letterSpacing: '0.05em',
        },
        labelBgStyle: {
          fill: isContradiction ? '#881337' : '#020617',
          fillOpacity: 0.9,
          stroke: isContradiction ? '#f43f5e' : '#334155',
          strokeWidth: 1,
        },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });
  }, [edges]);

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    if (qaMode) {
      setQaLoading(true);
      try {
        const answer = await onRunLocalQA(searchQuery);
        setQaAnswer({ q: searchQuery, a: answer });
      } catch (err: any) {
        setQaAnswer({ q: searchQuery, a: `Local Q&A error: ${err.message}` });
      } finally {
        setQaLoading(false);
      }
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-950 relative overflow-hidden">
      {/* Floating Offline Search Bar & Q&A HUD */}
      <div className="absolute top-3 left-4 right-4 z-20 flex flex-col items-center pointer-events-none">
        <form
          onSubmit={handleSearchSubmit}
          className="pointer-events-auto w-full max-w-xl bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-1.5 flex items-center space-x-2"
        >
          {/* Mode Switcher */}
          <div className="flex bg-slate-950 rounded-xl p-0.5 border border-slate-800 text-[10px] font-semibold shrink-0">
            <button
              type="button"
              onClick={() => {
                setQaMode(false);
                setQaAnswer(null);
              }}
              className={`px-2.5 py-1 rounded-lg transition ${
                !qaMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Filter
            </button>
            <button
              type="button"
              onClick={() => setQaMode(true)}
              className={`px-2.5 py-1 rounded-lg transition flex items-center space-x-1 ${
                qaMode ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="w-2.5 h-2.5" />
              <span>Ask Nano</span>
            </button>
          </div>

          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                qaMode
                  ? 'Ask on-device Gemini Nano about this graph (100% offline)...'
                  : 'Filter nodes by entity, claim, or keyword...'
              }
              className="w-full bg-transparent border-0 text-xs text-slate-100 placeholder-slate-400 focus:outline-none px-2 py-1 font-mono"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setQaAnswer(null);
                }}
                className="absolute right-1 top-1.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={qaLoading || !searchQuery.trim()}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition cursor-pointer disabled:opacity-40 shrink-0"
          >
            {qaLoading ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            ) : qaMode ? (
              <Send className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Search className="w-3.5 h-3.5 text-cyan-400" />
            )}
          </button>
        </form>

        {/* Instant Q&A Response Popover */}
        {qaAnswer && (
          <div className="pointer-events-auto mt-2 w-full max-w-xl bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 rounded-2xl p-3.5 shadow-2xl text-xs space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold uppercase">
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                <span>On-Device Gemini Nano Answer (Zero Cloud Egress)</span>
              </span>
              <button
                type="button"
                onClick={() => setQaAnswer(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="font-semibold text-slate-200">Q: {qaAnswer.q}</div>
            <div className="font-mono text-emerald-200 text-[11px] leading-relaxed">
              {qaAnswer.a}
            </div>
          </div>
        )}
      </div>

      {/* Main Graph Flow Canvas */}
      <div className="flex-1 w-full h-full">
        {nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-3 p-8">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl text-cyan-400">
              <Binary className="w-8 h-8" />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="font-bold text-slate-200 text-sm">Interactive Knowledge Graph</h3>
              <p className="text-xs text-slate-400">
                Load the sample case study or drop documents in the left pane, then click "Process Vault" to generate atomic nodes and relation edges.
              </p>
            </div>
          </div>
        ) : (
          <ErrorBoundary fallbackTitle="Interactive Graph Canvas Guard" fallbackMessage="An issue was intercepted while rendering the Knowledge Graph nodes. Use the reset button below or refresh.">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.2}
              maxZoom={1.8}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1e293b" gap={20} size={1} />
              <Controls className="bg-slate-900 border border-slate-800 text-white rounded-xl shadow-lg" />
              <MiniMap
                nodeColor={(n: any) => n.style?.background || '#334155'}
                className="bg-slate-900/90 border border-slate-800 rounded-xl"
                maskColor="rgba(2, 6, 23, 0.75)"
              />
            </ReactFlow>
          </ErrorBoundary>
        )}
      </div>

      {/* Category Legend Bar (Bottom Left) */}
      {nodes.length > 0 && (
        <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 flex items-center space-x-3 text-[10px] pointer-events-none">
          {Object.entries(CATEGORY_THEMES).map(([cat, col]) => (
            <div key={cat} className="flex items-center space-x-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: col.border }}
              />
              <span style={{ color: col.text }}>{cat}</span>
            </div>
          ))}
          <div className="h-3 w-px bg-slate-800" />
          <div className="flex items-center space-x-1 text-rose-400 font-bold">
            <span className="w-2.5 h-0.5 bg-rose-500" />
            <span>CONTRADICTS (High Priority)</span>
          </div>
        </div>
      )}

      {/* Node Detail Drawer / Popover (Bottom Right) */}
      {selectedNode && (
        <div className="absolute bottom-4 right-4 z-20 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl space-y-3 animate-fadeIn">
          <div className="flex items-start justify-between border-b border-slate-800 pb-2">
            <div>
              <span
                className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded"
                style={{
                  backgroundColor: CATEGORY_THEMES[selectedNode.category]?.bg,
                  color: CATEGORY_THEMES[selectedNode.category]?.text,
                  border: `1px solid ${CATEGORY_THEMES[selectedNode.category]?.border}`,
                }}
              >
                {selectedNode.category}
              </span>
              <h4 className="text-xs font-bold text-white mt-1">{selectedNode.label}</h4>
            </div>
            <button
              onClick={() => onSelectNode(null)}
              className="text-slate-400 hover:text-white p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">{selectedNode.summary}</p>

          <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block">Confidence</span>
              <span className="text-emerald-400 font-bold">
                {Math.round((selectedNode.confidence || 0.95) * 100)}%
              </span>
            </div>
            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 block">Extraction Latency</span>
              <span className="text-cyan-400 font-bold">{localExtractionLatencyMs}ms</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
