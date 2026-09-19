"use client";

/**
 * ONE CARD PER OBJECT — the repository, the document, the page — with its
 * operations INSIDE it.
 *
 * Replaces the previous "one card per kernel step" rendering, where a
 * repository existed only as a substring of a step id and `resolve:x` and
 * `clone:x` floated as separate top-level boxes. The object is the thing a
 * person is thinking about; find/download/verify are what happened to it.
 *
 * Every label here comes from the SEMANTIC layer. No capability id, no step
 * id, no `$from` reaches this component — those are technical truth, still
 * available by inspecting, never the primary read.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Check, X, Loader2, Clock, Ban } from "lucide-react";
import type { SemanticObject } from "@/lib/graph/semantics";
import { HUMAN_STATE } from "@/lib/graph/semantics";
import { STATE_CHROME } from "./nodeTypes";

function StepIcon({ state }: { state: SemanticObject["steps"][number]["state"] }) {
  if (state === "completed") return <Check size={12} />;
  if (state === "failed" || state === "blocked") return <X size={12} />;
  if (state === "running" || state === "retrying") return <Loader2 size={12} className="ow-spin" />;
  return <Clock size={12} />;
}

function ObjectNodeInner({ data, selected }: NodeProps) {
  const obj = (data as { object: SemanticObject }).object;
  const chrome = STATE_CHROME[obj.state];
  const agent = obj.steps.find((s) => s.state === "running")?.agent ?? obj.steps[0]?.agent;
  const totalMs = obj.steps.reduce((n, s) => n + (s.durationMs ?? 0), 0);
  const attempts = Math.max(...obj.steps.map((s) => s.attempts ?? 1), 1);

  return (
    <div
      className={`ow-obj ${selected ? "is-selected" : ""} ${obj.state === "running" ? "is-busy" : ""}`}
      style={{ borderColor: chrome.colour }}
    >
      <Handle type="target" position={Position.Left} className="optimus-port" />
      <Handle type="source" position={Position.Right} className="optimus-port" />

      <header className="ow-obj-head">
        <span className="ow-obj-title">{obj.title}</span>
        <span className="ow-obj-state" style={{ color: chrome.colour }}>
          {obj.state === "running" ? <Loader2 size={11} className="ow-spin" /> : null}
          {HUMAN_STATE[obj.state]}
        </span>
      </header>

      <ol className="ow-obj-steps">
        {obj.steps.map((s, i) => (
          <li key={s.nodeId} className={`ow-step is-${s.state}`}>
            <span className="ow-step-num">{i + 1}</span>
            <span className="ow-step-icon" style={{ color: STATE_CHROME[s.state].colour }}>
              <StepIcon state={s.state} />
            </span>
            <span className="ow-step-text">
              {/* Past tense once it passed, imperative while it has not —
                  so the card reads as a narrative rather than a status table. */}
              <b>{s.state === "completed" ? s.done : s.verb}</b>
              {s.because ? <em>{s.because}</em> : null}
              {s.state !== "completed" && s.checksTotal > 0 ? (
                <em>
                  {s.checksPassed}/{s.checksTotal} checks passed
                </em>
              ) : null}
            </span>
            {/* The human name for what flows to the next step. "commit SHA",
                not "sha → expectedSha". */}
            {s.produces && i < obj.steps.length - 1 ? (
              <span className="ow-step-flow">{s.produces}</span>
            ) : null}
          </li>
        ))}
      </ol>

      <footer className="ow-obj-foot">
        {agent ? <span>{agent}</span> : null}
        {attempts > 1 ? <span>{attempts} attempts</span> : null}
        {totalMs > 0 ? <span>{(totalMs / 1000).toFixed(1)}s</span> : null}
      </footer>
    </div>
  );
}

export const ObjectNode = memo(ObjectNodeInner);

/**
 * The collapsed form. At 244 repositories nothing readable exists at object
 * level, so a bucket of same-shaped objects renders as ONE card with counts —
 * and clicking it drills in. This is the scale answer as information
 * architecture rather than as a zoom setting.
 */
function BucketNodeInner({ data }: NodeProps) {
  const { label, total, verified, failed, running } = data as {
    label: string; total: number; verified: number; failed: number; running: number;
  };
  return (
    <div className="ow-bucket">
      <header className="ow-obj-head">
        <span className="ow-obj-title">{label}</span>
        <span className="ow-bucket-total">× {total}</span>
      </header>
      <div className="ow-bucket-counts">
        <span style={{ color: "var(--color-pass)" }}><Check size={12} /> {verified} verified</span>
        {failed > 0 ? <span style={{ color: "var(--color-fail)" }}><Ban size={12} /> {failed} failed</span> : null}
        {running > 0 ? <span style={{ color: "var(--color-run)" }}><Loader2 size={12} className="ow-spin" /> {running} running</span> : null}
      </div>
      <footer className="ow-obj-foot"><span>Click to open</span></footer>
    </div>
  );
}

export const BucketNode = memo(BucketNodeInner);
