"use client";

/**
 * The workspace. A THIN view over the graph endpoint.
 *
 * It holds no execution logic and no second copy of mission state: surfaces
 * fold the log, they never maintain their own truth (ADR-0012). Everything on
 * screen came from the kernel's own event record.
 *
 * The repo-download mission is ONE graph rendering here. Nothing in this file,
 * the canvas, the inspector or the dock knows what a repository is.
 */

import { useEffect, useMemo, useState } from "react";
import { FlowCanvas } from "@/components/canvas/FlowCanvas";
import { toFlow } from "@/lib/graph/toFlow";
import { AppShell } from "@/components/workspace/AppShell";
import { LeftRail } from "@/components/workspace/LeftRail";
import { Inspector } from "@/components/workspace/Inspector";
import { BottomDock } from "@/components/workspace/BottomDock";
import { STATE_CHROME } from "@/components/canvas/nodeTypes";
import type { Graph } from "@/lib/graph/model";
import type { KernelEvent } from "@/kernel/events";
import { Play, MoreHorizontal } from "lucide-react";
import { useLiveMission } from "@/lib/graph/useLiveMission";
import "./workspace.css";

export function MissionCanvasView({ missionId }: { missionId: string }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [events, setEvents] = useState<KernelEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // A LIVE run takes over the page when one is started. Until then the page
  // shows the last persisted mission, so opening it cold is never a blank
  // canvas asking you to do something first.
  const live = useLiveMission();
  const isLive = live.phase !== "idle" && live.graph !== null;

  useEffect(() => {
    let live = true;
    fetch(`/api/graph/${encodeURIComponent(missionId)}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        if (!r.ok || !body.ok) setError(body.reason ?? `HTTP ${r.status}`);
        else {
          setGraph(body.graph as Graph);
          setEvents((body.events ?? []) as KernelEvent[]);
        }
      })
      .catch((e) => live && setError(String(e)));
    return () => { live = false; };
  }, [missionId]);

  const shownGraph = isLive ? live.graph : graph;
  const shownEvents = isLive ? live.events : events;
  const flow = useMemo(
    () => (shownGraph ? toFlow(shownGraph) : { nodes: [], edges: [] }),
    [shownGraph],
  );
  const node = shownGraph?.nodes.find((n) => n.id === selected);


  if (error && !isLive) {
    return (
      <AppShell>
        <div className="ow-empty">
          <h2>No graph to show</h2>
          <p className="ow-muted">{error}</p>
          <p className="ow-muted">
            Run a mission first: <code>npm run download -- honojs/hono</code>
          </p>
        </div>
      </AppShell>
    );
  }
  if (!shownGraph) {
    return (
      <AppShell>
        <div className="ow-empty"><p className="ow-muted">Loading graph…</p></div>
      </AppShell>
    );
  }

  const g = shownGraph;
  const run = g.run;
  const runState = run ? STATE_CHROME[run.state] : undefined;
  const verified = g.nodes.filter((n) => n.state === "completed").length;
  const running = live.phase === "running";

  return (
    <AppShell>
      <header className="ow-header">

        <div className="ow-header-title">
          <h1>{g.title || missionId}</h1>
          <p className="ow-breadcrumb">{g.groups.map((g) => g.label).join("  →  ") || g.id}</p>
        </div>

        {runState && (
          <span className="ow-run-chip" style={{ color: runState.colour, borderColor: runState.colour }}>
            ● {runState.label}
          </span>
        )}
        <span className="ow-stat">{verified}/{g.nodes.length} steps verified</span>
        <span className="ow-stat">{g.edges.filter((e) => e.type === "dataFrom").length} data edges</span>
        {run?.startedAt && run?.endedAt && (
          <span className="ow-stat">{((run.endedAt - run.startedAt) / 1000).toFixed(1)}s</span>
        )}

        <div className="ow-header-actions">
          {/* A REAL run control. It posts to /api/graph/run and the canvas
              below folds the stream as the scheduler emits it. */}
          <button
            className="is-primary"
            disabled
            title="Starting work belongs in the Planning area, not the viewer"
          >
            <Play size={14} /> Run
          </button>
          <button className="ow-icon-btn" disabled><MoreHorizontal size={16} /></button>
        </div>
      </header>

      <div className="ow-body">
        <LeftRail />
        <main className="ow-main">
          <div className="ow-canvas">
            {live.error ? <div className="ow-run-error">{live.error}</div> : null}
            <FlowCanvas
              nodes={flow.nodes}
              edges={flow.edges}
              fitKey={g.id}
              onNodeClick={(_, n) => setSelected(n.type === "optimusGroup" ? null : n.id)}
            />
          </div>
          <BottomDock events={shownEvents} graph={g} />
        </main>
        <Inspector node={node} graph={g} />
      </div>
    </AppShell>
  );
}
