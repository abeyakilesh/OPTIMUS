"use client";

/**
 * A STEP, in human words. The primary content of the canvas.
 *
 *   ┌──────────────────────┐
 *   │ 🌐 Find Repository   │   ← what it DOES (semantics.verb)
 *   │ GitHub               │   ← where/who (semantics.agent)
 *   │ ✓ Repository found   │   ← what HAPPENED (semantics.done)
 *   └──────────────────────┘
 *
 * What is deliberately ABSENT: `github.resolve`, `resolve:prisma/prisma`,
 * `$from`, `sha`. Those are technical truth and remain one click away in the
 * inspector — they are simply not what a person reads first.
 *
 * The acceptance test this exists to pass: someone who has never heard of
 * `step.resolved` should look for five seconds and say what is happening.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Check, X, Loader2, Clock, AlertTriangle } from "lucide-react";
import type { GraphNode } from "@/lib/graph/model";
import { semanticsFor, HUMAN_STATE, humanError } from "@/lib/graph/semantics";
import { STATE_CHROME, chromeFor } from "./nodeTypes";

function StatusMark({ state }: { state: GraphNode["state"] }) {
  if (state === "completed") return <Check size={13} />;
  if (state === "failed") return <X size={13} />;
  if (state === "blocked") return <AlertTriangle size={13} />;
  if (state === "running" || state === "retrying") return <Loader2 size={13} className="ow-spin" />;
  return <Clock size={13} />;
}

function SemanticNodeInner({ data, selected }: NodeProps) {
  const node = (data as { node: GraphNode }).node;
  const d = (node.data ?? {}) as {
    capabilityId?: string;
    checks?: { passed: boolean; reason: string }[];
    attempts?: number;
    durationMs?: number;
    because?: string;
  };
  const sem = semanticsFor(d.capabilityId);
  const chrome = STATE_CHROME[node.state];
  const { Icon } = chromeFor(node.type);
  const checks = d.checks ?? [];
  const passed = checks.filter((c) => c.passed).length;
  const busy = node.state === "running" || node.state === "retrying";

  return (
    <div
      className={`ow-sem ${selected ? "is-selected" : ""} ${busy ? "is-busy" : ""}`}
      style={{ borderColor: chrome.colour }}
    >
      <Handle type="target" position={Position.Left} className="optimus-port" />
      <Handle type="source" position={Position.Right} className="optimus-port" />

      <div className="ow-sem-head">
        <span className="ow-sem-icon"><Icon size={14} /></span>
        <span className="ow-sem-verb">{sem.verb}</span>
      </div>

      {/* WHO is doing it — agents as visible participants, not hidden machinery. */}
      <div className="ow-sem-agent">{sem.agent}</div>

      <div className="ow-sem-status" style={{ color: chrome.colour }}>
        <StatusMark state={node.state} />
        <span>
          {node.state === "completed"
            ? sem.done
            : node.state === "failed" || node.state === "blocked"
              // The check's own words. Already written for a person by the
              // capability that failed, so it needs no translation here.
              ? (humanError(d.because ?? checks.find((c) => !c.passed)?.reason) ?? HUMAN_STATE[node.state])
              : HUMAN_STATE[node.state]}
        </span>
      </div>

      {(d.attempts && d.attempts > 1) || (busy && checks.length === 0) ? (
        <div className="ow-sem-meta">
          {d.attempts && d.attempts > 1 ? <span>Attempt {d.attempts} / 3</span> : null}
        </div>
      ) : null}

      {checks.length > 0 && node.state !== "completed" ? (
        <div className="ow-sem-meta">
          <span>{passed}/{checks.length} checks</span>
          {d.durationMs ? <span>{(d.durationMs / 1000).toFixed(1)}s</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export const SemanticNode = memo(SemanticNodeInner);
