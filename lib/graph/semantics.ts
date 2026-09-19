/**
 * THE SEMANTIC PROJECTION — what a person sees, derived from what the kernel did.
 *
 *              CANONICAL GRAPH  (kernel truth, unchanged)
 *                     │
 *          ┌──────────┴──────────┐
 *          ▼                     ▼
 *   semantic projection    technical view
 *      (primary UI)        (raw events, on inspect)
 *
 * WHY THIS EXISTS. The canvas was rendering `resolve:prisma/prisma`,
 * `github.resolve` and `sha → expectedSha` as its primary content — kernel
 * primitives presented as if they were the thing a person is meant to read.
 * They are implementation names. Nobody outside this repo knows what
 * `step.resolved` means, and nobody should have to.
 *
 * THE ACCEPTANCE TEST, and it is the only one that matters here: someone who
 * has never heard of `$from`, `github.resolve` or `git.clone` should look at
 * the canvas for five seconds and be able to say what OPTIMUS is doing, what
 * is running, what succeeded, and what failed.
 *
 * WHAT THIS IS NOT. It does not replace the graph, and the kernel does not
 * learn about it. Technical truth stays exactly where it was and remains
 * reachable by inspecting a node — this layer decides what is PRIMARY, never
 * what is available.
 *
 * ⚠️ Registry-driven, not mission-driven. A capability gets a row here and it
 * reads well everywhere. There is deliberately no branch on "is this the
 * download mission" — that would be the coupling this file exists to remove.
 */

import type { Graph, GraphNode, ExecState } from "./model";

/** How one capability reads to a person. */
export interface Semantics {
  /** Imperative, present tense — what this step DOES. "Find latest commit". */
  verb: string;
  /** Past tense, shown once it has passed. "GitHub confirmed commit". */
  done: string;
  /** Who is doing it. Agents become visible participants, not hidden machinery. */
  agent: string;
  /** What the step's OUTPUT is, in human words — the edge label. "commit SHA". */
  produces?: string;
}

/**
 * One row per capability. Unknown capabilities fall back to their own id,
 * which is honest: an untranslated step reads as technical rather than being
 * given an invented friendly name it has not earned.
 */
const SEMANTICS: Record<string, Semantics> = {
  "github.resolve": {
    verb: "Find latest commit",
    done: "GitHub confirmed commit",
    agent: "GitHub Resolver",
    produces: "commit SHA",
  },
  "git.clone": {
    verb: "Download repository",
    done: "Repository downloaded & verified",
    agent: "Git Runner",
    produces: "repository",
  },
  "fs.readFile": { verb: "Read document", done: "Document read", agent: "File Reader", produces: "text" },
  "repos.extract": { verb: "Extract repository list", done: "List extracted", agent: "Parser", produces: "repo list" },
  "web.fetch": { verb: "Fetch page", done: "Page fetched", agent: "Web Fetcher", produces: "page" },
  "html.extractTitle": { verb: "Read page title", done: "Title read", agent: "Parser", produces: "title" },
  "browser.navigate": { verb: "Open in browser", done: "Page opened", agent: "Browser", produces: "page" },
  "llm.chat": { verb: "Ask the model", done: "Model answered", agent: "Model", produces: "answer" },
  "scrapling.relocate": { verb: "Re-find element", done: "Element found", agent: "Scraper", produces: "element" },
};

/**
 * A failure, in words a person can act on.
 *
 * Raw stderr is technical truth and stays in the inspector. It is NOT what a
 * canvas should shout: `fatal: destination path '/var/folders/zy/5q_tfstx3_
 * v21kqnr3v5s2yw0000gn/T/optimus-downloads/prisma-prisma' already exists and
 * is not an empty directory` tells a person nothing they can do.
 *
 * Patterns are matched against the message the capability actually produced.
 * An unmatched failure falls through to a TRIMMED original rather than an
 * invented summary — guessing at a cause would be a description nobody
 * checked, which is the defect this project keeps catching.
 */
const FAILURE_PATTERNS: { match: RegExp; human: string }[] = [
  { match: /already exists and is not an empty directory/i, human: "Already downloaded — clear it and run again" },
  { match: /Could not resolve host|ENOTFOUND|EAI_AGAIN/i, human: "No internet connection" },
  { match: /does not exist \(404\)|Repository not found/i, human: "Repository not found on GitHub" },
  { match: /rate-limited|\b(403|429)\b/i, human: "GitHub rate limit reached — a token is needed" },
  { match: /timed out|ETIMEDOUT|timeout/i, human: "Took too long and was stopped" },
  { match: /Permission denied|EACCES/i, human: "Not allowed to write there" },
  { match: /authentication|unauthorized|401/i, human: "Sign-in failed" },
  { match: /commit mismatch/i, human: "Downloaded copy does not match GitHub" },
  { match: /no usable commit sha|not a commit id/i, human: "GitHub did not return a valid commit" },
  { match: /ENOSPC|no space left/i, human: "Ran out of disk space" },
  { match: /budget|max_?attempts|exhausted/i, human: "Gave up after too many attempts" },
];

export function humanError(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  for (const p of FAILURE_PATTERNS) if (p.match.test(raw)) return p.human;
  // Unmatched: strip the capability prefix and any absolute path, keep the
  // rest. Honest, and still far shorter than a stderr dump.
  return raw
    .replace(/^[a-z.]+:\s*/i, "")
    .replace(/'\/[^']*'/g, "the destination")
    .slice(0, 110);
}

export function semanticsFor(capabilityId: string | undefined): Semantics {
  if (!capabilityId) return { verb: "Step", done: "Done", agent: "Kernel" };
  return (
    SEMANTICS[capabilityId] ?? {
      // Untranslated, and it SAYS so by keeping the raw id. Inventing a label
      // for a capability nobody has described would be a description that no
      // one checked — the exact defect this project keeps catching.
      verb: capabilityId,
      done: `${capabilityId} completed`,
      agent: "Kernel",
    }
  );
}

/** Present-tense status a person reads, not a kernel enum. */
export const HUMAN_STATE: Record<ExecState, string> = {
  idle: "Waiting to start",
  queued: "Queued",
  running: "Running now",
  retrying: "Retrying",
  waiting: "Waiting",
  paused: "Paused",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
  completed: "Verified",
};

/**
 * An OBJECT the mission acts on — a repository, a document, a page.
 *
 * This is the reframing that makes the canvas readable: the repo is the thing,
 * and find/download/verify are operations INSIDE it. Previously each operation
 * was a top-level card and the repository existed only as a substring of an id.
 */
export interface SemanticObject {
  id: string;
  /** "prisma / prisma" — the object's own name, not a step id. */
  title: string;
  state: ExecState;
  /** The operations performed on it, in dependency order. */
  steps: {
    nodeId: string;
    verb: string;
    done: string;
    state: ExecState;
    agent: string;
    /** Human label for what flows OUT of this step into the next. */
    produces?: string;
    attempts?: number;
    durationMs?: number;
    /** Why it failed or blocked — plain words, already written by the check. */
    because?: string;
    checksPassed: number;
    checksTotal: number;
  }[];
}

export interface AgentActivity {
  agent: string;
  active: number;
  completed: number;
  failed: number;
}

export interface SemanticView {
  objective: string;
  /** The mission-level count. Every number here is counted, never typed. */
  total: number;
  verified: number;
  failed: number;
  running: number;
  objects: SemanticObject[];
  agents: AgentActivity[];
}

/** Rolls a group's steps into one state: worst-first, running beats idle. */
function rollUp(states: ExecState[]): ExecState {
  if (states.includes("failed")) return "failed";
  if (states.includes("blocked")) return "blocked";
  if (states.includes("running") || states.includes("retrying")) return "running";
  if (states.length > 0 && states.every((s) => s === "completed")) return "completed";
  if (states.includes("queued")) return "queued";
  return "idle";
}

export function toSemanticView(graph: Graph): SemanticView {
  const byGroup = new Map<string, GraphNode[]>();
  const loose: GraphNode[] = [];
  for (const n of graph.nodes) {
    if (n.groupId) {
      if (!byGroup.has(n.groupId)) byGroup.set(n.groupId, []);
      byGroup.get(n.groupId)!.push(n);
    } else loose.push(n);
  }

  // Dependency order inside an object, so "find → download → verify" reads in
  // the order it happened rather than the order the log stored it.
  const depthOf = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const n of graph.nodes) incoming.set(n.id, []);
  for (const e of graph.edges) if (e.type === "dependsOn") incoming.get(e.to)?.push(e.from);
  const walk = (id: string, seen: Set<string>): number => {
    if (depthOf.has(id)) return depthOf.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    const deps = incoming.get(id) ?? [];
    const d = deps.length ? Math.max(...deps.map((p) => walk(p, seen) + 1)) : 0;
    depthOf.set(id, d);
    return d;
  };
  for (const n of graph.nodes) walk(n.id, new Set());

  const objects: SemanticObject[] = [];
  const agentTally = new Map<string, AgentActivity>();

  const buildSteps = (members: GraphNode[]) =>
    [...members]
      .sort((a, b) => (depthOf.get(a.id) ?? 0) - (depthOf.get(b.id) ?? 0))
      .map((n) => {
        const d = (n.data ?? {}) as {
          capabilityId?: string;
          checks?: { passed: boolean }[];
          attempts?: number;
          durationMs?: number;
          because?: string;
        };
        const sem = semanticsFor(d.capabilityId);
        const checks = d.checks ?? [];

        const tally = agentTally.get(sem.agent) ?? { agent: sem.agent, active: 0, completed: 0, failed: 0 };
        if (n.state === "running" || n.state === "retrying") tally.active++;
        else if (n.state === "completed") tally.completed++;
        else if (n.state === "failed" || n.state === "blocked") tally.failed++;
        agentTally.set(sem.agent, tally);

        return {
          nodeId: n.id,
          verb: sem.verb,
          done: sem.done,
          state: n.state,
          agent: sem.agent,
          produces: sem.produces,
          attempts: d.attempts,
          durationMs: d.durationMs,
          because: d.because,
          checksPassed: checks.filter((c) => c.passed).length,
          checksTotal: checks.length,
        };
      });

  for (const group of graph.groups) {
    const members = byGroup.get(group.id) ?? [];
    if (members.length === 0) continue;
    const steps = buildSteps(members);
    objects.push({
      id: group.id,
      // The OBJECT's name, spaced for reading. "prisma / prisma".
      title: group.label.replace("/", " / "),
      state: rollUp(steps.map((s) => s.state)),
      steps,
    });
  }

  // Ungrouped steps are their own single-step objects rather than being hidden.
  for (const n of loose) {
    const steps = buildSteps([n]);
    objects.push({ id: n.id, title: steps[0]?.verb ?? n.label, state: n.state, steps });
  }

  return {
    objective: graph.title,
    total: objects.length,
    verified: objects.filter((o) => o.state === "completed").length,
    failed: objects.filter((o) => o.state === "failed" || o.state === "blocked").length,
    running: objects.filter((o) => o.state === "running").length,
    objects,
    agents: [...agentTally.values()].sort((a, b) => b.active - a.active || b.completed - a.completed),
  };
}
