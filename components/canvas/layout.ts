/**
 * Layered layout — a node sits one column right of its deepest dependency.
 *
 * Deliberately derived from `dependsOn` ONLY, never from `dataFrom`. Order is
 * structural and known before anything runs, so the graph has a stable shape
 * the moment it is proposed; provenance edges arrive during execution and must
 * not make nodes jump around while a person is watching them.
 */

import type { Graph, GraphNode } from "@/lib/graph/model";

export const NODE_W = 210;
export const NODE_H = 74;
const COL_GAP = 130;
const ROW_GAP = 34;

export interface Positioned extends GraphNode {
  position: { x: number; y: number };
}

export function layout(graph: Graph): { nodes: Positioned[]; width: number; height: number } {
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of graph.edges) {
    if (e.type !== "dependsOn") continue;
    incoming.get(e.to)?.push(e.from);
  }

  // Longest path from a root. Memoised, with a `seen` guard so a cycle degrades
  // to a drawable graph instead of hanging the browser — the scheduler already
  // rejects cycles, and a renderer that trusted that would freeze on a log
  // written by an older kernel.
  const depth = new Map<string, number>();
  const compute = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = incoming.get(id) ?? [];
    const d = deps.length === 0 ? 0 : Math.max(...deps.map((p) => compute(p, seen) + 1));
    depth.set(id, d);
    return d;
  };
  for (const n of graph.nodes) compute(n.id, new Set());

  const byColumn = new Map<number, GraphNode[]>();
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? 0;
    if (!byColumn.has(d)) byColumn.set(d, []);
    byColumn.get(d)!.push(n);
  }

  const nodes: Positioned[] = [];
  let maxRows = 0;
  for (const [col, group] of [...byColumn.entries()].sort((a, b) => a[0] - b[0])) {
    maxRows = Math.max(maxRows, group.length);
    group.forEach((n, row) => {
      nodes.push({
        ...n,
        // A user-dragged position always wins over computed layout.
        position: n.position ?? { x: col * (NODE_W + COL_GAP), y: row * (NODE_H + ROW_GAP) },
      });
    });
  }

  return {
    nodes,
    width: byColumn.size * (NODE_W + COL_GAP),
    height: maxRows * (NODE_H + ROW_GAP),
  };
}

/**
 * n8n-style horizontal bezier: control points pushed out sideways so wires
 * leave a port horizontally and arrive horizontally, however the nodes sit.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
  return `M ${x1},${y1} C ${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
