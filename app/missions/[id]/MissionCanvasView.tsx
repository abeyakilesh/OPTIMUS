"use client";

/**
 * The mission's canvas page — a THIN view over the graph endpoint.
 *
 * It fetches a `Graph` and hands it to `Canvas`. It holds no execution logic
 * and no second copy of mission state: per ADR-0012, surfaces fold the log,
 * they do not maintain their own truth. Everything shown here came from the
 * kernel's own event record.
 */

import { useEffect, useState } from "react";
import { Canvas } from "@/components/canvas/Canvas";
import { STATE_CHROME } from "@/components/canvas/nodeTypes";
import type { Graph } from "@/lib/graph/model";
import "./canvas.css";

export function MissionCanvasView({ missionId }: { missionId: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/graph/${encodeURIComponent(missionId)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (!r.ok || !body.ok) setError(body.reason ?? `HTTP ${r.status}`);
        else setGraph(body.graph as Graph);
      })
      .catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [missionId]);

  if (error) {
    return (
      <div className="mc-empty">
        <h2>No graph to show</h2>
        <p>{error}</p>
        <p className="mc-hint">Run a mission first: <code>npm run download -- honojs/hono</code></p>
      </div>
    );
  }
  if (!graph) return <div className="mc-empty"><p>Loading graph…</p></div>;

  const node = graph.nodes.find((n) => n.id === selected);
  const run = graph.run;
  const verified = graph.nodes.filter((n) => n.state === "completed").length;

  return (
    <div className="mc-root">
      <header className="mc-header">
        <div className="mc-title">
          <h1>{graph.title || missionId}</h1>
          <span className="mc-id">{graph.id}</span>
        </div>
        <div className="mc-stats">
          {run && (
            <span className="mc-chip" style={{ color: STATE_CHROME[run.state].colour }}>
              ● {STATE_CHROME[run.state].label}
            </span>
          )}
          <span className="mc-chip">{verified}/{graph.nodes.length} steps verified</span>
          <span className="mc-chip">{graph.edges.filter((e) => e.type === "dataFrom").length} data edges</span>
          {run?.startedAt && run?.endedAt && (
            <span className="mc-chip">{((run.endedAt - run.startedAt) / 1000).toFixed(1)}s</span>
          )}
        </div>
      </header>

      <div className="mc-body">
        <Canvas graph={graph} selectedId={selected} onSelect={setSelected} />

        <aside className="mc-side">
          <h2>{node ? "Node" : "Warehouse"}</h2>
          {node ? (
            <NodeInspector node={node} graph={graph} />
          ) : (
            <div className="mc-warehouse">
              <p className="mc-muted">Select a node to inspect its evidence.</p>
              <h3>Data edges</h3>
              {graph.edges.filter((e) => e.type === "dataFrom").length === 0 ? (
                <p className="mc-muted">None — no value has been resolved between steps.</p>
              ) : (
                graph.edges.filter((e) => e.type === "dataFrom").map((e) => (
                  <div key={e.id} className="mc-row">
                    <code>{e.label}</code>
                    <span className="mc-muted">{e.from} → {e.to}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="mc-legend">
        <span><i className="lg lg-dep" /> dependsOn — order, known from the plan</span>
        <span><i className="lg lg-data" /> dataFrom — provenance, recorded by the kernel</span>
      </footer>
    </div>
  );
}

function NodeInspector({ node, graph }: { node: Graph["nodes"][number]; graph: Graph }) {
  const d = (node.data ?? {}) as {
    capabilityId?: string; checks?: { checkId: string; passed: boolean; reason: string }[];
    durationMs?: number; cost?: number; artifactIds?: string[]; because?: string; attempts?: number;
  };
  const inbound = graph.edges.filter((e) => e.to === node.id);
  return (
    <div className="mc-inspect">
      <div className="mc-row"><span>state</span><b style={{ color: STATE_CHROME[node.state].colour }}>{node.state}</b></div>
      <div className="mc-row"><span>capability</span><code>{d.capabilityId ?? node.type}</code></div>
      {d.attempts ? <div className="mc-row"><span>attempts</span><b>{d.attempts}</b></div> : null}
      {typeof d.durationMs === "number" ? <div className="mc-row"><span>duration</span><b>{d.durationMs}ms</b></div> : null}
      {d.because ? <div className="mc-row"><span>reason</span><b>{d.because}</b></div> : null}

      <h3>Checks</h3>
      {(d.checks ?? []).length === 0 ? <p className="mc-muted">No checks recorded.</p> :
        d.checks!.map((c) => (
          <div key={c.checkId} className={`mc-check ${c.passed ? "ok" : "bad"}`}>
            <b>{c.passed ? "✓" : "✕"} {c.checkId}</b>
            <span>{c.reason}</span>
          </div>
        ))}

      <h3>Inputs came from</h3>
      {inbound.length === 0 ? <p className="mc-muted">Nothing — this is a root step.</p> :
        inbound.map((e) => (
          <div key={e.id} className="mc-row">
            <code>{e.type === "dataFrom" ? e.label : e.type}</code>
            <span className="mc-muted">{e.from}</span>
          </div>
        ))}

      <h3>Artifacts</h3>
      {(d.artifactIds ?? []).length === 0 ? <p className="mc-muted">None produced.</p> :
        d.artifactIds!.map((a) => <div key={a} className="mc-row"><code className="mc-hash">{a}</code></div>)}
    </div>
  );
}
