"use client";

/**
 * A labelled region — the "1. Research & Data Collection" band.
 *
 * It is a real ReactFlow PARENT NODE, not a drawn rectangle. That distinction
 * is the scale answer: xyflow owns child coordinates, containment and nested
 * dragging, so a group can be collapsed to one node and 244 repos becomes 244
 * regions instead of 488 loose cards.
 *
 * Renders behind its children (`zIndex 0` in toFlow) and is non-selectable, so
 * clicking inside always hits the node the user aimed at.
 */

import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { GROUP_TINTS } from "./nodeTypes";

function GroupNodeInner({ data }: NodeProps) {
  const { label, tint = 0, objective, state, durationMs, source } = data as {
    label: string; tint?: number; objective?: string; state?: string;
    durationMs?: number; source?: string;
  };
  const t = GROUP_TINTS[tint % GROUP_TINTS.length];

  return (
    <div className="optimus-group" style={{ background: t.bg, borderColor: t.border }}>
      {/* The OBJECT's own header: what this is and how it is going. The
          steps inside are operations performed ON it. */}
      <div className="optimus-group-head">
        <div>
          <div className="optimus-group-title" style={{ color: t.text }}>
            {objective ?? "Task"}
          </div>
          <div className="optimus-group-source">{source ?? label}</div>
        </div>
        {state ? (
          <div className="optimus-group-status">
            <span className="optimus-group-state">{state}</span>
            {durationMs ? <span className="optimus-group-time">{(durationMs / 1000).toFixed(1)}s</span> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const GroupNode = memo(GroupNodeInner);
