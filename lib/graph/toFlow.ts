/**
 * Canonical Graph → ReactFlow `{nodes, edges}`.
 *
 * The boundary that keeps the graph model independent of its renderer. Nothing
 * upstream of here imports `@xyflow/react`; nothing downstream needs to know
 * what a mission is. Swapping the graph library is a rewrite of THIS FILE and
 * nothing else.
 *
 * Shape learned from OmniRoute's `comboFlowModel.ts` (MIT) — a pure function
 * from a typed model to `{nodes, edges}`, no React, no side effects, so it is
 * testable without mounting anything.
 *
 * GROUPS BECOME REACTFLOW PARENT NODES. That is the whole scale answer: xyflow
 * handles child coordinates, collapsing and nested dragging natively, so 244
 * repos is 244 collapsible regions rather than 488 loose cards.
 */

import { MarkerType, type Node, type Edge } from "@xyflow/react";
import type { Graph, GraphNode } from "./model";
import { semanticsFor, HUMAN_STATE } from "./semantics";

/** Must match `.ow-sem` in workspace.css — a layout that disagrees with the
 *  rendered size is how nodes end up overlapping their own group. */
const NODE_W = 212;
const NODE_H = 104;
/**
 * Generous, and that is the point. Edge routing quality is mostly a SPACING
 * problem: `smoothstep` produces clean orthogonal runs when there is room for
 * the elbow, and cuts across node bodies when there is not. Widening the
 * column gap fixes more visual mess than any router setting.
 */
const COL_GAP = 168;
const ROW_GAP = 40;
const GROUP_PAD_X = 28;
const GROUP_PAD_TOP = 62;
const GROUP_PAD_BOTTOM = 26;
const GROUP_GAP_Y = 34;

/** Column index = longest dependsOn chain. Order is structural, so it is stable. */
function depths(graph: Graph): Map<string, number> {
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of graph.edges) {
    if (e.type === "dependsOn") incoming.get(e.to)?.push(e.from);
  }
  const depth = new Map<string, number>();
  const walk = (id: string, seen: Set<string>): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 0; // cycle guard — the scheduler rejects these, but an old log may hold one
    seen.add(id);
    const deps = incoming.get(id) ?? [];
    const d = deps.length ? Math.max(...deps.map((p) => walk(p, seen) + 1)) : 0;
    depth.set(id, d);
    return d;
  };
  for (const n of graph.nodes) walk(n.id, new Set());
  return depth;
}

export interface FlowGraph {
  nodes: Node[];
  edges: Edge[];
}

/** The object's headline, derived from what its steps do. */
function objectiveFor(members: GraphNode[]): string {
  const verbs = members.map((m) => semanticsFor(((m.data ?? {}) as { capabilityId?: string }).capabilityId).verb);
  if (verbs.length === 0) return "Task";
  if (verbs.length === 1) return verbs[0];
  // "Find latest commit → Download repository" reads as a sentence; the full
  // list would not, so only the ends are shown.
  return `${verbs[0]} → ${verbs[verbs.length - 1]}`;
}

function rollUpLabel(members: GraphNode[]): string {
  const states = members.map((m) => m.state);
  if (states.includes("failed") || states.includes("blocked")) return HUMAN_STATE.failed;
  if (states.includes("running") || states.includes("retrying")) return HUMAN_STATE.running;
  if (states.length > 0 && states.every((s) => s === "completed")) return HUMAN_STATE.completed;
  return HUMAN_STATE.idle;
}

export function toFlow(graph: Graph): FlowGraph {
  const depth = depths(graph);
  const nodes: Node[] = [];

  // Ungrouped nodes lay out at the top level; grouped ones inside their region.
  const grouped = new Map<string, GraphNode[]>();
  const loose: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (n.groupId) {
      if (!grouped.has(n.groupId)) grouped.set(n.groupId, []);
      grouped.get(n.groupId)!.push(n);
    } else loose.push(n);
  }

  let cursorY = 0;

  for (const group of graph.groups) {
    const members = grouped.get(group.id) ?? [];
    if (members.length === 0) continue;

    const cols = new Map<number, GraphNode[]>();
    for (const m of members) {
      const d = depth.get(m.id) ?? 0;
      if (!cols.has(d)) cols.set(d, []);
      cols.get(d)!.push(m);
    }
    const sorted = [...cols.entries()].sort((a, b) => a[0] - b[0]);
    const rows = Math.max(...sorted.map(([, g]) => g.length), 1);
    const width = sorted.length * NODE_W + Math.max(sorted.length - 1, 0) * COL_GAP + GROUP_PAD_X * 2;
    const height = rows * NODE_H + Math.max(rows - 1, 0) * ROW_GAP + GROUP_PAD_TOP + GROUP_PAD_BOTTOM;

    // The region itself. `selectable:false` so clicking the band does not steal
    // selection from the node the user aimed at.
    nodes.push({
      id: group.id,
      type: "optimusGroup",
      position: { x: 0, y: cursorY },
      data: {
        label: group.label,
        tint: group.tint ?? 0,
        // Read from the SEMANTICS of the steps inside, so the frame describes
        // the work rather than repeating a step id.
        objective: objectiveFor(members),
        source: group.label,
        state: rollUpLabel(members),
        durationMs: members.reduce((n, m) => n + (((m.data ?? {}) as { durationMs?: number }).durationMs ?? 0), 0),
      },
      style: { width, height },
      draggable: false,
      selectable: false,
      zIndex: 0,
    });

    sorted.forEach(([, colMembers], colIdx) => {
      colMembers.forEach((m, rowIdx) => {
        nodes.push({
          id: m.id,
          type: "semanticNode",
          // Child coordinates are RELATIVE to the parent — xyflow's own model,
          // which is why nesting and collapsing come for free.
          parentId: group.id,
          extent: "parent",
          position: {
            x: GROUP_PAD_X + colIdx * (NODE_W + COL_GAP),
            y: GROUP_PAD_TOP + rowIdx * (NODE_H + ROW_GAP),
          },
          data: { node: m },
          zIndex: 1,
        });
      });
    });

    cursorY += height + GROUP_GAP_Y;
  }

  loose.forEach((m, i) => {
    nodes.push({
      id: m.id,
      type: "semanticNode",
      position: { x: (depth.get(m.id) ?? 0) * (NODE_W + COL_GAP), y: cursorY + i * (NODE_H + ROW_GAP) },
      data: { node: m },
    });
  });

  const edges: Edge[] = graph.edges.map((e) => {
    // The two wire kinds mean different things, so they are visually different:
    // dependsOn is a promise from the plan; dataFrom is evidence the kernel
    // recorded. See projector.ts.
    const isData = e.type === "dataFrom";
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      type: "smoothstep",
      // A right-angle radius large enough to read as a routed wire rather than
      // a bent line, matching how n8n and langflow draw theirs.
      pathOptions: { borderRadius: 14, offset: 22 },
      animated: isData,
      // HUMAN label. The raw `sha → expectedSha` is technical truth and stays
      // in the inspector; the wire says what the VALUE is.
      label: isData
        ? semanticsFor(
            ((graph.nodes.find((n) => n.id === e.from)?.data ?? {}) as { capabilityId?: string }).capabilityId,
          ).produces ?? e.label
        : undefined,
      labelShowBg: true,
      // Data wires ride ABOVE control wires: when both connect the same pair,
      // the one carrying evidence is the one worth reading.
      zIndex: isData ? 3 : 2,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14,
        color: isData ? "var(--color-cyan)" : "var(--color-line-2)" },
      data: { kind: e.type, ...e.data },
      style: isData
        ? { stroke: "var(--color-cyan)", strokeWidth: 2 }
        : { stroke: "var(--color-line-2)", strokeWidth: 1.5 },
      labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--color-cyan-dark)" },
      labelBgStyle: { fill: "var(--color-white)", stroke: "var(--color-cyan-soft)" },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
    };
  });

  return { nodes, edges };
}
