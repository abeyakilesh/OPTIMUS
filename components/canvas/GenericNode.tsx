"use client";

/**
 * ONE node component for every NodeType. Pattern from langflow's
 * `CustomNodes/GenericNode` (MIT): the renderer reads `data`, never a
 * per-type component tree.
 *
 * This is the difference between a workspace and a mission dashboard. A video
 * model, a human approval and a capability step all render here; what differs
 * is the icon, the sublabel and which badges have values. Adding a node type
 * is a row in `nodeTypes.tsx`, not a new component.
 *
 * ⚠️ ADR-0015: every badge below is a field the PROJECTOR set from a real
 * kernel event. There is deliberately no "thinking…" state, because no event
 * means it.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { GraphNode } from "@/lib/graph/model";
import { chromeFor, STATE_CHROME } from "./nodeTypes";

function GenericNodeInner({ data, selected }: NodeProps) {
  const node = (data as { node: GraphNode }).node;
  const chrome = chromeFor(node.type);
  const state = STATE_CHROME[node.state];
  const Icon = chrome.Icon;

  const d = (node.data ?? {}) as {
    attempts?: number;
    checks?: { passed: boolean }[];
    because?: string;
    continued?: boolean;
    agent?: string;
  };
  const checks = d.checks ?? [];
  const passed = checks.filter((c) => c.passed).length;
  const busy = node.state === "running" || node.state === "retrying";

  return (
    <div
      className={`optimus-node ${selected ? "is-selected" : ""} ${busy ? "is-busy" : ""}`}
      style={{ borderColor: state.colour }}
    >
      {/* Ports. Rendered always so a node's connectability is visible even
          before anything is wired to it — the same affordance n8n gives. */}
      <Handle type="target" position={Position.Left} className="optimus-port" />
      <Handle type="source" position={Position.Right} className="optimus-port" />

      <div className={`optimus-node-icon ${chrome.accented ? "is-accent" : ""}`}>
        <Icon size={16} strokeWidth={2} />
      </div>

      <div className="optimus-node-body">
        <div className="optimus-node-label" title={node.label}>
          {node.label}
        </div>
        <div className="optimus-node-sub" title={node.sublabel ?? node.type}>
          {node.sublabel ?? node.type}
        </div>
      </div>

      <div className="optimus-node-state">
        {busy ? (
          <span className="optimus-spinner" style={{ borderTopColor: state.colour }} />
        ) : (
          <span className="optimus-dot" style={{ background: state.colour }} />
        )}
      </div>

      <div className="optimus-node-badges">
        {d.attempts && d.attempts > 1 ? <span className="optimus-badge">{d.attempts}×</span> : null}
        {checks.length > 0 ? (
          <span className={`optimus-badge ${passed === checks.length ? "is-ok" : "is-bad"}`}>
            {passed}/{checks.length} checks
          </span>
        ) : null}
        {d.continued ? <span className="optimus-badge is-warn">continued</span> : null}
        {node.state === "blocked" && d.because ? (
          <span className="optimus-badge is-warn" title={d.because}>
            blocked
          </span>
        ) : null}
        {d.agent ? <span className="optimus-badge">{d.agent}</span> : null}
      </div>
    </div>
  );
}

export const GenericNode = memo(GenericNodeInner);
