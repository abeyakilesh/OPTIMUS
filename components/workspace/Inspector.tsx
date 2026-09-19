"use client";

/**
 * The right panel. GENERIC — it renders `Port[]`, `ExecState` and the node's
 * check list, none of which are capability-specific.
 *
 * The earlier version read `git.clone`'s fields directly, which is exactly the
 * coupling that turns a workspace into a one-mission viewer. Nothing in this
 * file knows what a repository is.
 */

import type { Graph, GraphNode } from "@/lib/graph/model";
import { STATE_CHROME, chromeFor } from "@/components/canvas/nodeTypes";
import { semanticsFor } from "@/lib/graph/semantics";
import { ArrowRight, Ban } from "lucide-react";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="ow-kv">
      <span>{k}</span>
      <b>{v}</b>
    </div>
  );
}

export function Inspector({ node, graph }: { node?: GraphNode; graph: Graph }) {
  if (!node) {
    const dataEdges = graph.edges.filter((e) => e.type === "dataFrom");
    return (
      <aside className="ow-inspector">
        <div className="ow-inspector-tabs">
          <span className="is-active">Inspector</span>
        </div>
        <div className="ow-inspector-body">
          <p className="ow-muted">Select a node to inspect its evidence.</p>
          <h3>Data edges</h3>
          {dataEdges.length === 0 ? (
            <p className="ow-muted">
              None. No value has been resolved between steps — provenance is recorded, never assumed.
            </p>
          ) : (
            dataEdges.map((e) => {
              const fromNode = graph.nodes.find((n) => n.id === e.from);
              const toNode = graph.nodes.find((n) => n.id === e.to);
              const fromSem = semanticsFor(((fromNode?.data ?? {}) as { capabilityId?: string }).capabilityId);
              const toSem = semanticsFor(((toNode?.data ?? {}) as { capabilityId?: string }).capabilityId);
              return (
                <div key={e.id} className="ow-edge-row">
                  {/* HUMAN first: what travelled, and between which pieces of
                      work. The step ids are technical truth and sit under it. */}
                  <span className="ow-edge-what">{fromSem.produces ?? "a value"}</span>
                  <span className="ow-muted">
                    {fromSem.verb} <ArrowRight size={11} /> {toSem.verb}
                  </span>
                  <code className="ow-edge-tech">{e.from} → {e.to}</code>
                </div>
              );
            })
          )}
        </div>
      </aside>
    );
  }

  const state = STATE_CHROME[node.state];
  const { Icon } = chromeFor(node.type);
  const d = (node.data ?? {}) as {
    capabilityId?: string;
    checks?: { checkId: string; passed: boolean; reason: string }[];
    durationMs?: number;
    cost?: number;
    attempts?: number;
    because?: string;
    agent?: string;
  };

  return (
    <aside className="ow-inspector">
      <div className="ow-inspector-tabs">
        <span className="is-active">Inspector</span>
        <span className="is-soon" title="Not built yet">History</span>
        <span className="is-soon" title="Not built yet">Config</span>
      </div>

      <div className="ow-inspector-body">
        <div className="ow-inspector-head">
          <div className="ow-inspector-icon"><Icon size={18} /></div>
          <div>
            <div className="ow-inspector-title">{node.label}</div>
            <div className="ow-muted">{node.sublabel ?? node.type}</div>
          </div>
          <span className="ow-state-chip" style={{ color: state.colour, borderColor: state.colour }}>
            ● {state.label}
          </span>
        </div>

        <Row k="Type" v={node.type} />
        {d.capabilityId ? <Row k="Capability" v={<code>{d.capabilityId}</code>} /> : null}
        {d.agent ? <Row k="Agent" v={d.agent} /> : null}

        <h3>Inputs ({node.inputs?.length ?? 0})</h3>
        {(node.inputs ?? []).length === 0 ? (
          <p className="ow-muted">None declared.</p>
        ) : (
          node.inputs!.map((p) => (
            <div key={p.name} className="ow-port">
              <div className="ow-port-name">{p.name}</div>
              <div className="ow-muted">{p.kind}</div>
              {p.linkedNodeId ? (
                <div className="ow-port-link">
                  from <b>{p.linkedNodeId}</b>
                  {p.linkedField ? <code>.{p.linkedField}</code> : null}
                </div>
              ) : null}
            </div>
          ))
        )}

        <h3>Outputs ({node.outputs?.length ?? 0})</h3>
        {(node.outputs ?? []).length === 0 ? (
          <p className="ow-muted">None produced.</p>
        ) : (
          node.outputs!.map((p) => (
            <div key={p.name} className="ow-port">
              <div className="ow-port-name">{p.name}</div>
              <div className="ow-muted">{p.kind}</div>
              {p.linkedField ? <code className="ow-hash">{p.linkedField}</code> : null}
            </div>
          ))
        )}

        <h3>Execution</h3>
        <Row k="Status" v={<span style={{ color: state.colour }}>{state.label}</span>} />
        {d.attempts ? <Row k="Attempts" v={`${d.attempts}`} /> : null}
        {typeof d.durationMs === "number" ? <Row k="Duration" v={`${d.durationMs}ms`} /> : null}
        {typeof d.cost === "number" ? <Row k="Cost" v={`${d.cost}`} /> : null}
        {d.because ? <Row k="Reason" v={d.because} /> : null}

        <h3>Checks</h3>
        {(d.checks ?? []).length === 0 ? (
          <p className="ow-muted">No checks recorded.</p>
        ) : (
          d.checks!.map((c) => (
            <div key={c.checkId} className={`ow-check ${c.passed ? "is-ok" : "is-bad"}`}>
              <b>{c.passed ? "✓" : "✕"} {c.checkId}</b>
              <span>{c.reason}</span>
            </div>
          ))
        )}

        <button className="ow-cancel" disabled title="Cancelling a running step is not wired yet">
          <Ban size={14} /> Cancel Node
        </button>
      </div>
    </aside>
  );
}
