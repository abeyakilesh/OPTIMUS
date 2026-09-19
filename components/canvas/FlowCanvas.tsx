"use client";

/**
 * The graph surface. Ported from OmniRoute's `shared/components/flow/FlowCanvas.tsx`
 * (MIT) — same stack, same framework, and it already carries a real bug fix
 * worth inheriting rather than rediscovering:
 *
 *   The generation counter. An earlier OmniRoute revision kept the ReactFlow
 *   instance in a plain ref that outlived remounts, so a queued `fitView` could
 *   fire against a disposed instance and throw "Node cannot be found in the
 *   current page". Every `onInit` bumps a counter and every deferred call
 *   checks it. That is exactly the class of bug hand-rolling this would have
 *   cost a day to find.
 *
 * What is OURS and not ported: the node/edge registry, the graph model it
 * renders, and the rule that every visual comes from a real kernel event.
 */

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type ReactFlowInstance,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SemanticNode } from "./SemanticNode";
import { GroupNode } from "./GroupNode";
import { STATE_CHROME } from "./nodeTypes";
import type { GraphNode } from "@/lib/graph/model";

const FIT_VIEW_OPTIONS = { padding: 0.2, duration: 250 } as const;
const REFIT_DELAY_MS = 60;

/** Registered once, outside render — remounting these would remount every node. */
const NODE_TYPES = { semanticNode: SemanticNode, optimusGroup: GroupNode };

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: NodeMouseHandler;
  /** Changing this remounts the graph for a fresh fit. */
  fitKey?: string | number;
  interactive?: boolean;
}

export function FlowCanvas({ nodes, edges, onNodeClick, fitKey, interactive = true }: Props) {
  const rf = useRef<ReactFlowInstance | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const generation = useRef(0);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    const gen = ++generation.current;
    rf.current = instance;
    setTimeout(() => {
      if (generation.current === gen) instance.fitView(FIT_VIEW_OPTIONS);
    }, REFIT_DELAY_MS);
  }, []);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const ro = new ResizeObserver(() => rf.current?.fitView(FIT_VIEW_OPTIONS));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const gen = generation.current;
    const id = setTimeout(() => {
      if (generation.current === gen) rf.current?.fitView(FIT_VIEW_OPTIONS);
    }, REFIT_DELAY_MS);
    return () => clearTimeout(id);
  }, [nodes.length]);

  // Cleared on unmount so a late ResizeObserver tick cannot reach a disposed instance.
  useEffect(() => () => { rf.current = null; }, []);

  return (
    <div ref={container} className="h-full w-full min-w-0 overflow-hidden">
      <ReactFlow
        key={fitKey}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onInit={onInit}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={interactive}
        nodesConnectable={false}
        elementsSelectable
        preventScrolling={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--color-line-2)" />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-left"
          className="optimus-minimap"
          // Minimap colour tracks EXECUTION STATE, so a failure is findable at
          // a glance in a graph too large to read.
          nodeColor={(n) => {
            if (n.type === "optimusGroup") return "var(--color-line)";
            const g = (n.data as { node?: GraphNode })?.node;
            return g ? STATE_CHROME[g.state].colour : "var(--color-muted)";
          }}
        />
      </ReactFlow>
    </div>
  );
}
