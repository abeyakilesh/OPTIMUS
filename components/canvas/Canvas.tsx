"use client";

/**
 * THE CANVAS CORE. It renders a `Graph` and knows nothing else.
 *
 * It has never heard of a mission, a repository, or `git.clone`. It looks up
 * each node's `type` in the renderer registry, draws the same card, and routes
 * a wire for each edge. That is the whole contract — which is what lets a
 * video-generation graph or a human-approval graph render here with no change.
 *
 * ⚠️ ADR-0015: every badge, ring and animation below is driven by a field the
 * PROJECTOR set from a real kernel event. Nothing here invents activity. There
 * is deliberately no "thinking…" shimmer, because no kernel event means it.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { Graph, GraphEdge } from "@/lib/graph/model";
import { chromeFor, STATE_CHROME } from "./nodeTypes";
import { layout, bezier, NODE_W, NODE_H } from "./layout";

interface Props {
  graph: Graph;
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
}

export function Canvas({ graph, onSelect, selectedId }: Props) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 60, y: 40 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const { nodes, width, height } = useMemo(() => layout(graph), [graph]);
  const posById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.position])),
    [nodes],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only the background pans — a drag that started on a node is the node's.
      if ((e.target as HTMLElement).closest("[data-node]")) return;
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setPan({
      x: drag.current.px + (e.clientX - drag.current.x),
      y: drag.current.py + (e.clientY - drag.current.y),
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scroll stays scroll
    e.preventDefault();
    setZoom((z) => Math.min(2, Math.max(0.25, z - e.deltaY * 0.002)));
  }, []);

  /** Wire geometry: leave the right port, arrive at the left port. */
  const wire = (edge: GraphEdge): { d: string; mx: number; my: number } | null => {
    const a = posById.get(edge.from);
    const b = posById.get(edge.to);
    if (!a || !b) return null;
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    return { d: bezier(x1, y1, x2, y2), mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };

  return (
    <div className="canvas-root" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
         onPointerUp={() => (drag.current = null)} onWheel={onWheel}
         onClick={(e) => { if (!(e.target as HTMLElement).closest("[data-node]")) onSelect?.(null); }}>
      <div className="canvas-viewport"
           style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="canvas-wires" width={Math.max(width + 400, 1200)} height={Math.max(height + 400, 800)}>
          <defs>
            <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3"
                    orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--wire)" />
            </marker>
            <marker id="arrow-data" markerWidth="9" markerHeight="9" refX="8" refY="3"
                    orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--wire-data)" />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const w = wire(edge);
            if (!w) return null;
            // THE TWO WIRE KINDS, visually distinct because they mean different
            // things: dependsOn is a promise from the plan; dataFrom is
            // evidence the kernel recorded. See projector.ts.
            const isData = edge.type === "dataFrom";
            return (
              <g key={edge.id} className={isData ? "wire wire-data" : "wire"}>
                <path d={w.d} fill="none"
                      stroke={isData ? "var(--wire-data)" : "var(--wire)"}
                      strokeWidth={isData ? 2 : 1.5}
                      strokeDasharray={isData ? "6 4" : undefined}
                      markerEnd={`url(#${isData ? "arrow-data" : "arrow"})`} />
                {edge.label && (
                  <foreignObject x={w.mx - 78} y={w.my - 26} width={156} height={26}>
                    <div className="wire-label">{edge.label}</div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </svg>

        {nodes.map((n) => {
          const chrome = chromeFor(n.type);
          const state = STATE_CHROME[n.state];
          const d = (n.data ?? {}) as {
            attempts?: number; checks?: { passed: boolean }[]; because?: string;
            durationMs?: number; agent?: string; continued?: boolean;
          };
          const checks = d.checks ?? [];
          const passed = checks.filter((c) => c.passed).length;
          return (
            <div key={n.id} data-node className={`node ${selectedId === n.id ? "node-sel" : ""}`}
                 style={{ left: n.position.x, top: n.position.y, width: NODE_W, height: NODE_H,
                          borderColor: state.colour }}
                 onClick={(e) => { e.stopPropagation(); onSelect?.(n.id); }}>
              <span className="port port-in" />
              <span className="port port-out" />

              <div className={chrome.accented ? "node-icon node-icon-accent" : "node-icon"}>{chrome.icon}</div>
              <div className="node-body">
                <div className="node-label" title={n.label}>{n.label}</div>
                <div className="node-sub">{n.sublabel ?? n.type}</div>
              </div>

              <div className="node-state">
                {n.state === "running" || n.state === "retrying" ? (
                  <span className="spinner" style={{ borderTopColor: state.colour }} />
                ) : (
                  <span className="dot" style={{ background: state.colour }} />
                )}
              </div>

              {/* Every badge below is a real field the projector set. */}
              <div className="node-badges">
                {d.attempts && d.attempts > 1 ? <span className="badge">{d.attempts}×</span> : null}
                {checks.length > 0 ? (
                  <span className={`badge ${passed === checks.length ? "badge-ok" : "badge-bad"}`}>
                    {passed}/{checks.length} checks
                  </span>
                ) : null}
                {d.continued ? <span className="badge badge-warn">continued</span> : null}
                {n.state === "blocked" && d.because ? (
                  <span className="badge badge-warn" title={d.because}>blocked</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="canvas-zoom">
        <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))} aria-label="zoom out">−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} aria-label="zoom in">+</button>
        <button onClick={() => { setZoom(1); setPan({ x: 60, y: 40 }); }} aria-label="reset view">⤢</button>
      </div>
    </div>
  );
}
