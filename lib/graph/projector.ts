/**
 * KERNEL EVENTS → CANONICAL GRAPH. The only file that knows both sides.
 *
 * Everything upstream of here is the kernel's business; everything downstream
 * renders a `Graph` and has never heard of a mission. When OPTIMUS grows a
 * kind of work that is not a capability step — a human approval, a video
 * model, a nested workflow — the change lands HERE and in a renderer. Not in
 * the graph model, and not in the canvas.
 *
 * ⚠️ THE HONEST HALF (ADR-0015). `model.ts` declares twenty node types and
 * fourteen edge types. This file emits **two node types and two edge types**,
 * because that is all today's kernel actually produces. The gap is the point:
 * the model is ready for work that does not exist yet, and the projector
 * refuses to invent it. A canvas showing an "agent" node when no agent ran
 * would be the Atlas health-score ring with better styling.
 */

import type { KernelEvent } from "@/kernel/events";
import type { MissionSpec, StepStatus } from "@/kernel/types";
import {
  type Graph,
  type ExecState,
  type GraphNode,
  emptyGraph,
  edgeId,
  nodeById,
} from "./model";

/**
 * The kernel's step vocabulary, mapped to the graph's.
 *
 * These are NOT the same list and must not be collapsed into one. `StepStatus`
 * describes a step in a mission; `ExecState` describes any node in any graph,
 * including kinds of work the kernel has no status for (a human who has not
 * answered is `waiting`; nothing in `StepStatus` means that).
 */
const STATE_OF: Record<StepStatus, ExecState> = {
  pending: "idle",
  running: "running",
  passed: "completed",
  failed: "failed",
  "budget-exhausted": "failed",
  blocked: "blocked",
  skipped: "completed",
};

/**
 * Build the graph's SHAPE from the plan, before anything runs.
 *
 * Deliberately separate from the event fold: a mission that has been proposed
 * and not started is a real thing a person should be able to look at. A design
 * that only produced a graph from execution events could not draw it.
 */
export function projectSpec(spec: MissionSpec): Graph {
  const graph = emptyGraph(spec.id, spec.objective);

  /**
   * GROUPING IS STRUCTURAL, NOT COSMETIC.
   *
   * A 244-repo download is 244 groups of two steps, not 488 nodes in a column.
   * The grouping key comes from the step id's SUBJECT (`clone:owner/repo` ->
   * `owner/repo`), which is the same thing a person means by "that repo's
   * work" — so a group can be collapsed to one node, and the canvas stays
   * readable at any size without inventing a clustering heuristic.
   *
   * Steps with no `:` fall into no group and lay out at the top level, which
   * is correct for a mission whose steps are genuinely unrelated.
   */
  const subjectOf = (stepId: string): string | undefined => {
    const at = stepId.indexOf(":");
    return at > 0 ? stepId.slice(at + 1) : undefined;
  };
  const subjects = [...new Set(spec.steps.map((s) => subjectOf(s.id)).filter(Boolean))] as string[];
  subjects.forEach((subject, i) => {
    graph.groups.push({
      id: `group:${subject}`,
      label: subject,
      index: i + 1,
      tint: i % 6,
    });
  });

  for (const step of spec.steps) {
    graph.nodes.push({
      id: step.id,
      type: "capability",
      label: step.id,
      sublabel: step.capabilityId,
      state: "idle",
      groupId: subjectOf(step.id) ? `group:${subjectOf(step.id)}` : undefined,
      // Ports come from the STEP, so the inspector never needs per-capability
      // knowledge. A `$from` input is recorded with where it points, which is
      // what makes the inspector's "came from" section generic.
      inputs: Object.entries((step.input ?? {}) as Record<string, unknown>).map(([name, v]) => {
        const ref = v && typeof v === "object" && "$from" in v ? String((v as { $from: string }).$from) : undefined;
        const [fromNode, fromField] = ref ? ref.split(".") : [];
        return { name, kind: ref ? "Reference" : typeof v, linkedNodeId: fromNode, linkedField: fromField };
      }),
      data: { capabilityId: step.capabilityId, checks: step.checks, attempts: 0 },
    });

    // ORDER, known from the plan. Contrast `dataFrom` below, which is not.
    for (const dep of step.dependsOn) {
      graph.edges.push({
        id: edgeId(dep, step.id, "dependsOn"),
        from: dep,
        to: step.id,
        type: "dependsOn",
      });
    }
  }
  return graph;
}

function patch(graph: Graph, id: string, fn: (n: GraphNode) => void): void {
  const node = nodeById(graph, id);
  if (node) fn(node);
}

/**
 * Fold one event into the graph. Mutates and returns, so a caller can fold a
 * whole log or stream events in one at a time — the CLI and the browser use
 * the same function on the same log, which is what stops them disagreeing.
 */
export function applyEvent(graph: Graph, event: KernelEvent): Graph {
  switch (event.type) {
    case "mission.proposed":
      return projectSpec(event.spec);

    case "mission.started":
      graph.run = { ...graph.run, state: "running", startedAt: event.at };
      return graph;

    case "step.started":
      patch(graph, event.stepId, (n) => {
        n.state = "running";
        // The agent is shown ON the node when there is one, and not invented
        // when there is not. Today the kernel rarely sets it.
        if (event.agent) n.data = { ...n.data, agent: event.agent };
      });
      return graph;

    case "step.attempt":
      patch(graph, event.stepId, (n) => {
        n.data = { ...n.data, attempts: event.attempt };
        // Attempt 2+ is a RETRY, and looks different from a first run. The
        // kernel distinguishes them; a canvas that showed both as "running"
        // would hide the most interesting thing a step does.
        if (event.attempt > 1) n.state = "retrying";
      });
      return graph;

    /**
     * THE EDGE THAT IS EVIDENCE.
     *
     * A `dataFrom` edge is only created here, when the kernel has actually
     * resolved a `$from` reference and recorded what it pointed at. It is
     * never derived from the plan — the plan says a reference EXISTS, this
     * says what it RESOLVED TO, and those differ exactly when something has
     * gone wrong.
     *
     * On #84's mission this is the line reading `sha → expectedSha`: the value
     * GitHub reported travelling into the check that verifies the clone. That
     * one arrow is the mission's whole claim to being un-fakeable, drawn from
     * the kernel's own record of it.
     */
    case "step.resolved":
      for (const r of event.resolved) {
        const [fromStep, fromField] = r.from.split(".");
        // `r.at` is the full destination path (`clone:x.input.expectedSha`).
        // The wire shows the FIELD, because the step it lands on is already
        // the node the wire points at — repeating it is noise on a canvas
        // where every pixel of label competes with the graph.
        const intoField = r.at.split(".").pop() ?? r.at;
        graph.edges.push({
          id: `${edgeId(fromStep, event.stepId, "dataFrom")}:${r.at}`,
          from: fromStep,
          to: event.stepId,
          type: "dataFrom",
          label: `${fromField ?? r.from} → ${intoField}`,
          data: { field: fromField, into: r.at, artifactId: r.outputArtifactId },
        });
      }
      return graph;

    case "step.finished":
      patch(graph, event.stepId, (n) => {
        n.state = STATE_OF[event.status] ?? "idle";
        n.outputs = (event.evidence.producedArtifactIds ?? event.evidence.artifactIds ?? []).map(
          (id, i) => ({ name: `artifact${i > 0 ? i + 1 : ""}`, kind: "Artifact", linkedField: id }),
        );
        n.data = {
          ...n.data,
          exitCode: event.evidence.exitCode,
          durationMs: event.evidence.durationMs,
          cost: event.evidence.cost,
          artifactIds: event.evidence.producedArtifactIds ?? event.evidence.artifactIds,
          // Checks are the reason a step is believed, so they travel with the
          // node rather than living only in a side panel.
          checks: event.evidence.checks?.map((c) => ({
            checkId: c.checkId,
            passed: c.passed,
            reason: c.reason,
          })),
        };
      });
      return graph;

    case "step.blocked":
      patch(graph, event.stepId, (n) => {
        n.state = "blocked";
        // The REASON, not just the state. "blocked" with no cause is the kind
        // of dead-end a person cannot act on.
        n.data = { ...n.data, because: event.because };
      });
      return graph;

    case "step.continued":
      // Deliberately NOT `blocked`. The step failed and the graph carried on
      // because it was declared continue-on-error; showing it as blocked would
      // state the opposite of what happened.
      patch(graph, event.stepId, (n) => {
        n.data = { ...n.data, continued: true, because: event.because };
      });
      return graph;

    case "mission.finished":
      graph.run = {
        ...graph.run,
        state: event.status === "green" ? "completed" : "failed",
        endedAt: event.at,
      };
      return graph;

    case "mission.rolled-back":
      graph.run = { ...graph.run, state: "cancelled", endedAt: event.at };
      return graph;

    default:
      // An event this projector does not understand changes nothing. It is
      // NOT an error: the kernel may grow events before the UI does, and a
      // surface that threw on an unknown event would make every kernel
      // addition a breaking change.
      return graph;
  }
}

/** Fold a whole log. Same function the stream uses, one event at a time. */
export function projectLog(events: readonly KernelEvent[], fallbackId = "graph"): Graph {
  let graph = emptyGraph(fallbackId, "");
  for (const event of events) graph = applyEvent(graph, event);
  return graph;
}
