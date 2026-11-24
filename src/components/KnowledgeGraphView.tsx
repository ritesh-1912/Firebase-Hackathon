import React, { useMemo } from 'react';
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

interface KnowledgeGraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string | null) => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Entity: { bg: '#064e3b', border: '#10b981', text: '#6ee7b7' },
  Concept: { bg: '#312e81', border: '#6366f1', text: '#a5b4fc' },
  Claim: { bg: '#0c4a6e', border: '#0ea5e9', text: '#7dd3fc' },
  Risk: { bg: '#881337', border: '#f43f5e', text: '#fda4af' },
  Evidence: { bg: '#78350f', border: '#f59e0b', text: '#fcd34d' },
};

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}) => {
  // Convert GraphNodes to ReactFlow Nodes with circular/orbital positioning
  const flowNodes: Node[] = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    const total = nodes.length;
    const radius = Math.max(160, total * 30);
    const centerX = 300;
    const centerY = 240;

    return nodes.map((n, i) => {
      const angle = (i / total) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      const colors = CATEGORY_COLORS[n.category] || CATEGORY_COLORS.Entity;
      const isSelected = selectedNodeId === n.id;

      return {
        id: n.id,
        position: { x, y },
        data: {
          label: (
            <div
              className="p-2 text-left space-y-1 max-w-[180px]"
              onClick={() => onSelectNode?.(n.id)}
            >
              <div className="flex items-center justify-between text-[10px] uppercase font-bold">
                <span style={{ color: colors.text }}>{n.category}</span>
                <span className="text-slate-400 font-mono">
                  {Math.round((n.confidence || 0.9) * 100)}%
                </span>
              </div>
              <div className="font-semibold text-xs text-white truncate">{n.label}</div>
              {n.summary && (
                <div className="text-[10px] text-slate-300 line-clamp-2 leading-tight">
                  {n.summary}
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: colors.bg,
          border: `2px solid ${isSelected ? '#ffffff' : colors.border}`,
          borderRadius: '12px',
          boxShadow: isSelected
            ? '0 0 15px rgba(255, 255, 255, 0.4)'
            : '0 4px 12px rgba(0,0,0,0.5)',
          padding: '2px',
          cursor: 'pointer',
          width: 190,
        },
      };
    });
  }, [nodes, selectedNodeId, onSelectNode]);

  // Convert GraphEdges to ReactFlow Edges
  const flowEdges: Edge[] = useMemo(() => {
    if (!edges || edges.length === 0) return [];

    return edges.map((e, idx) => {
      let strokeColor = '#64748b';
      if (e.relation === 'SUPPORTS') strokeColor = '#10b981';
      else if (e.relation === 'CONTRADICTS') strokeColor = '#f43f5e';
      else if (e.relation === 'DEPENDS_ON') strokeColor = '#f59e0b';
      else strokeColor = '#818cf8';

      return {
        id: `e_${e.source}_${e.target}_${idx}`,
        source: e.source,
        target: e.target,
        label: e.relation,
        animated: e.relation === 'DEPENDS_ON' || e.relation === 'CONTRADICTS',
        style: { stroke: strokeColor, strokeWidth: 2 },
        labelStyle: {
          fill: strokeColor,
          fontWeight: 700,
          fontSize: 10,
        },
        labelBgStyle: {
          fill: '#020617',
          fillOpacity: 0.85,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: strokeColor,
        },
      };
    });
  }, [edges]);

  if (nodes.length === 0) {
    return (
      <div className="h-72 flex flex-col items-center justify-center bg-slate-950/60 border border-slate-800 rounded-2xl text-slate-500 text-xs space-y-2">
        <p>No graph nodes extracted yet.</p>
        <p className="text-[11px] text-slate-600">
          Upload documents or run local extraction to generate atomic knowledge nodes and relationship edges.
        </p>
      </div>
    );
  }

  return (
    <div className="h-96 w-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden relative shadow-inner">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={16} size={1} />
        <Controls className="bg-slate-900 border border-slate-700 text-white rounded-lg" />
        <MiniMap
          nodeColor={(n: any) => n.style?.background || '#334155'}
          className="bg-slate-900 border border-slate-800 rounded-lg"
          maskColor="rgba(2, 6, 23, 0.7)"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 flex items-center space-x-3 text-[10px] pointer-events-none">
        {Object.entries(CATEGORY_COLORS).map(([cat, col]) => (
          <div key={cat} className="flex items-center space-x-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: col.border }}
            />
            <span style={{ color: col.text }}>{cat}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
