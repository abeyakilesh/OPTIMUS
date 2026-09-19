"use client";

/**
 * Logs · Events · Artifacts · Metrics · Chat.
 *
 * Every row is a real `KernelEvent` from the mission's log — the same log the
 * CLI folds. This is the panel where "OPTIMUS says it did something" becomes
 * checkable, so it shows the raw event type rather than a friendly summary.
 */

import { useMemo, useState } from "react";
import type { KernelEvent } from "@/kernel/events";
import type { Graph } from "@/lib/graph/model";
import { ScrollText, Activity, Boxes, BarChart3, MessageSquare, Send } from "lucide-react";

const TABS = [
  { id: "logs", label: "Logs", Icon: ScrollText },
  { id: "events", label: "Events", Icon: Activity },
  { id: "artifacts", label: "Artifacts", Icon: Boxes },
  { id: "metrics", label: "Metrics", Icon: BarChart3 },
  { id: "chat", label: "Chat", Icon: MessageSquare },
] as const;

const DOT: Record<string, string> = {
  "mission.proposed": "var(--color-muted)",
  "mission.started": "var(--color-cyan)",
  "step.started": "var(--color-cyan)",
  "step.attempt": "var(--color-run)",
  "step.resolved": "var(--color-pass)",
  "step.finished": "var(--color-pass)",
  "step.blocked": "var(--color-fail)",
  "step.continued": "var(--color-run)",
  "mission.finished": "var(--color-ink)",
  "mission.rolled-back": "var(--color-fail)",
};

function clock(at: number): string {
  return new Date(at).toLocaleTimeString("en-GB", { hour12: false });
}

/** One line per event, in the event's own vocabulary. */
function describe(e: KernelEvent): string {
  switch (e.type) {
    case "mission.proposed": return e.spec.objective;
    case "mission.started": return e.missionId;
    case "step.started": return e.stepId;
    case "step.attempt": return `${e.stepId} — attempt ${e.attempt}`;
    case "step.resolved": return `${e.stepId} ← ${e.resolved.map((r) => r.from).join(", ")}`;
    case "step.finished": return `${e.stepId} — ${e.status} (${e.evidence.durationMs}ms)`;
    case "step.blocked": return `${e.stepId} — ${e.because}`;
    case "step.continued": return `${e.stepId} — ${e.because}`;
    case "mission.finished": return `${e.missionId} — ${e.status}`;
    case "mission.rolled-back": return e.missionId;
    default: return "";
  }
}

export function BottomDock({ events, graph }: { events: KernelEvent[]; graph: Graph }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("logs");
  const [filter, setFilter] = useState("all");

  const shown = useMemo(
    () => (filter === "all" ? events : events.filter((e) => e.type.startsWith(filter))),
    [events, filter],
  );

  const artifacts = useMemo(() => {
    const out: { stepId: string; id: string }[] = [];
    for (const n of graph.nodes) {
      for (const p of n.outputs ?? []) if (p.linkedField) out.push({ stepId: n.id, id: p.linkedField });
    }
    return out;
  }, [graph]);

  return (
    <section className="ow-dock">
      <div className="ow-dock-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button key={id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}>
            <Icon size={13} /> {label}
          </button>
        ))}
        <div className="ow-dock-spacer" />
        {(tab === "logs" || tab === "events") && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ow-select">
            <option value="all">All events</option>
            <option value="step">Steps only</option>
            <option value="mission">Mission only</option>
          </select>
        )}
      </div>

      <div className="ow-dock-body">
        {(tab === "logs" || tab === "events") &&
          (shown.length === 0 ? (
            <p className="ow-muted ow-pad">No events.</p>
          ) : (
            shown.map((e, i) => (
              <div key={i} className="ow-log-row">
                <span className="ow-log-dot" style={{ background: DOT[e.type] ?? "var(--color-muted)" }} />
                <span className="ow-log-time">{clock(e.at)}</span>
                <span className="ow-log-type">{e.type}</span>
                <span className="ow-log-msg">{describe(e)}</span>
              </div>
            ))
          ))}

        {tab === "artifacts" &&
          (artifacts.length === 0 ? (
            <p className="ow-muted ow-pad">No artifacts produced.</p>
          ) : (
            artifacts.map((a) => (
              <div key={a.id} className="ow-log-row">
                <span className="ow-log-type">{a.stepId}</span>
                <code className="ow-hash">{a.id}</code>
              </div>
            ))
          ))}

        {tab === "metrics" && (
          <div className="ow-metrics">
            {/* Counted from the graph, never typed. THE COUNTING RULE. */}
            <div><b>{graph.nodes.filter((n) => n.state === "completed").length}</b><span>verified</span></div>
            <div><b>{graph.nodes.filter((n) => n.state === "failed").length}</b><span>failed</span></div>
            <div><b>{graph.edges.filter((e) => e.type === "dataFrom").length}</b><span>data edges</span></div>
            <div><b>{events.length}</b><span>events</span></div>
            <div>
              <b>{graph.run?.startedAt && graph.run?.endedAt ? `${((graph.run.endedAt - graph.run.startedAt) / 1000).toFixed(1)}s` : "—"}</b>
              <span>duration</span>
            </div>
          </div>
        )}

        {tab === "chat" && (
          <p className="ow-muted ow-pad">
            Asking OPTIMUS about a mission is not wired yet — the compiler is not reachable from this page.
          </p>
        )}
      </div>

      <div className="ow-ask">
        <input placeholder="Ask OPTIMUS about this workflow, select a node, or give an instruction…" disabled />
        <button disabled aria-label="Send"><Send size={15} /></button>
      </div>
    </section>
  );
}
