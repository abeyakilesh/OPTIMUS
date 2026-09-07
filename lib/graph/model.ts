/**
 * THE CANONICAL GRAPH — the only thing any surface understands.
 *
 * The canvas, the timeline and the chat all read this and nothing else. None
 * of them knows what a "mission" is, what `git.clone` is, or that today's
 * example happens to be resolve → clone → validate.
 *
 * WHY THIS EXISTS AS A SEPARATE MODEL, rather than the canvas reading
 * `KernelEvent` directly. A renderer written against `KernelEvent` is a
 * renderer for capability steps. The day a node is a human approval, a video
 * model, or a nested subgraph, that renderer needs rewriting — and rewriting
 * a UI to admit a new kind of work is how a product gets trapped inside its
 * first use case.
 *
 * So the dependency is deliberately one-directional and the boundary is
 * deliberately dumb:
 *
 *     kernel  →  projector  →  THIS  →  renderers
 *
 * The projector is the only file that knows both sides. Adding a new kind of
 * work means adding a projector rule and a renderer. It never means touching
 * the graph model, and it never means touching the canvas core.
 *
 * ⚠️ THE RULE THAT KEEPS THIS HONEST (ADR-0015): every node, edge, badge and
 * animation on screen must come from a real kernel event. This model makes it
 * *possible* to draw anything; the projector is what decides what is TRUE.
 * A node type existing here is not permission to render one nobody produced.
 */

/** Bumped when a consumer would misread an older payload. Sent with every snapshot. */
export const GRAPH_SCHEMA_VERSION = 1;

/**
 * Open on purpose — `| (string & {})` keeps the known list autocompleting
 * while allowing a type nothing has registered yet.
 *
 * Only `capability` and `subgraph` have real data behind them today. The rest
 * are declared now because the cost of declaring them is zero and the cost of
 * discovering the model cannot express them is a rewrite.
 */
export type NodeType =
  | "capability"   // a kernel step — the only one today's projector emits
  | "agent" | "model" | "tool" | "api" | "code" | "browser" | "terminal"
  | "dataset" | "file" | "database" | "rag"
  | "human" | "approval" | "decision" | "condition"
  | "trigger" | "scheduler" | "workflow" | "subgraph"
  | "mission" | "note"
  | (string & {});

/**
 * How two nodes relate. The renderer decides what each LOOKS like; the graph
 * only says what it IS.
 *
 * The two that carry real data today are worth distinguishing sharply:
 *
 *   `dependsOn` — ORDER. "B does not start until A passes." Known from the
 *                 plan, so it can be drawn before anything runs.
 *   `dataFrom`  — PROVENANCE. "B received this value from A." Cannot be known
 *                 from the plan alone; it is only true once the kernel has
 *                 resolved it. Drawn from `step.resolved`, never inferred.
 *
 * That difference is the most informative thing on the canvas: one is a
 * promise, the other is evidence.
 */
export type EdgeType =
  | "dependsOn" | "dataFrom"
  | "calls" | "delegatesTo" | "controls" | "observes"
  | "produces" | "consumes" | "triggers" | "references"
  | "approves" | "blocks" | "streamsTo" | "syncsWith"
  | (string & {});

/**
 * Execution state is an OVERLAY on the graph, never part of its shape.
 *
 * The same graph exists before it runs, while it runs, and after — a design
 * that folds state into structure cannot show you a plan that has not started,
 * and ends up needing a second incompatible model for "design mode".
 */
export type ExecState =
  | "idle"      // exists in the graph, no run has touched it
  | "queued" | "running" | "waiting" | "retrying"
  | "blocked"   // an upstream failure stopped it — carries a reason
  | "failed" | "completed" | "cancelled" | "paused";

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  /** Secondary line — the capability id, the model name, the tool. */
  sublabel?: string;
  state: ExecState;
  /**
   * Renderer-specific payload. The canvas core NEVER reads inside this; only
   * the renderer registered for `type` does. That is what lets a new node type
   * carry new fields without a schema change.
   */
  data?: Record<string, unknown>;
  /** Set when this node opens into its own graph. Nesting, for scale. */
  subgraphId?: string;
  /** Cluster membership — what collapses together at low zoom. */
  groupId?: string;
  /** Set by layout, or by a user dragging. Absent means "lay me out". */
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  /** e.g. dataFrom carries { field: "sha", into: "expectedSha", artifactId }. */
  data?: Record<string, unknown>;
  label?: string;
}

export interface GraphGroup {
  id: string;
  label: string;
  /** Collapsed groups render as ONE node. This is how 10,000 stays usable. */
  collapsed?: boolean;
}

export interface Graph {
  schemaVersion: number;
  id: string;
  /** What this graph is FOR, in a person's words. */
  title: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
  /** Overlay-level status. Absent for a graph that has never run. */
  run?: {
    state: ExecState;
    startedAt?: number;
    endedAt?: number;
    cost?: number;
  };
}

export function emptyGraph(id: string, title: string): Graph {
  return { schemaVersion: GRAPH_SCHEMA_VERSION, id, title, nodes: [], edges: [], groups: [] };
}

/** Lookup helpers the projector and renderers both need. */
export function nodeById(graph: Graph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function edgeId(from: string, to: string, type: EdgeType): string {
  return `${type}:${from}->${to}`;
}
