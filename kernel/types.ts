/**
 * K0 — the vocabulary. Every other kernel module speaks these types.
 *
 * The shapes follow CLAUDE.md's execution model: a mission is a pull request,
 * a step is a job, and a step is DONE only when a check passes. Nothing here
 * has a "confidence" field, on purpose — model confidence is not a check.
 */

import type { Isolation } from "./sandbox";
import type { InputConstraints } from "./inputContract";
import type { OutputConstraints } from "./outputContract";
export type { Isolation };

/** Content-addressed artifact id: "sha256:<64 hex>". */
export type ArtifactId = string;

export type StepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "budget-exhausted"
  | "blocked" // an upstream step failed
  | "skipped"; // inputs unchanged, memoised

export type MissionStatus = "proposed" | "running" | "green" | "red" | "rolled-back";

/**
 * A permission a capability may hold. Deliberately coarse for WP-001 —
 * the point is that a boundary EXISTS and is enforced, not that it is rich.
 */
export type Permission =
  | "net:read"
  | "net:write"
  | "fs:read"
  | "fs:write"
  | "proc:spawn";

/**
 * Budgets are not optional. CLAUDE.md: "No step runs without a declared
 * budget... A loop without a budget is a slot machine."
 */
export interface Budget {
  /** Hard cap on attempts of the step loop. Must be >= 1. */
  maxAttempts: number;
  /** Wall-clock ceiling for the whole step, across all attempts, in ms. */
  maxWallTimeMs: number;
  /** Cost ceiling in arbitrary units (tokens, currency — caller's choice). */
  maxCost: number;
}

/** What a capability declares about itself. Gate 8 of the onboarding pipeline. */
export interface CapabilityManifest {
  id: string;
  version: string;
  /** Least privilege. The broker refuses anything not listed here. */
  permissions: Permission[];
  /**
   * K4 blast radius (gate 10). Permissions say WHAT; this says WHERE.
   * Omitted means DENY ALL — a capability with no declared radius reaches
   * nothing, so an incomplete manifest fails closed rather than open.
   * The broker refuses to register a permission whose radius is unbounded.
   */
  isolation?: Isolation;
  /**
   * Gate 8, third leg. Permissions say WHAT, isolation says WHERE, and this
   * says WHAT IT MAY BE ASKED TO DO — the shape and permitted values of the
   * step input this capability will accept.
   *
   * REQUIRED, not optional, and that is the whole point: an optional field
   * becomes decoration on the manifests nobody revisits. A capability that
   * genuinely takes no input declares `{}`, which means "the input must be
   * empty" — not "anything goes".
   *
   *   K4 refuses the outbound connection; it does not refuse a capability
   *   constructing a request to a host it was handed. Those are different
   *   layers.
   *
   * See kernel/inputContract.ts for the three real holes this closed.
   */
  inputConstraints: InputConstraints;
  /**
   * Gate 8, fourth leg. The three above say what a capability may do, where,
   * and what it may be asked to do. This says WHAT IT GIVES BACK — the fields
   * of `run()`'s resolved value.
   *
   * REQUIRED, for the same reason `inputConstraints` is, plus one more that is
   * specific to outputs: a later step referencing `{"$from": "fetch.title"}`
   * can only be refused while the plan is being validated if something records
   * that `web.fetch` returns `artifactId` and `bytes` and no `title`. Without
   * this the reference validates, the mission runs, and the value arrives as
   * `undefined` several steps downstream.
   *
   * A capability that genuinely returns nothing declares `{}`, meaning "the
   * output must be empty" — not "anything goes".
   *
   * ENFORCED ON THE WAY OUT, not only at registration: the harness checks the
   * real return value against this before a step can pass. A declaration
   * nothing checks is a claim about a thing that lives somewhere else, which
   * is exactly what THE SELF-DESCRIPTION RULE is about.
   */
  outputs: OutputConstraints;
  /** Budgets a step gets by default when it invokes this capability. */
  defaultBudget: Budget;
  /** Human-readable, used in evidence. */
  description: string;
}

/** One invocation of a capability. The "commit" in the PR analogy. */
export interface Action {
  capabilityId: string;
  input: unknown;
  /** Which attempt of the step loop produced this action (1-based). */
  attempt: number;
}

/** What came back. Either a value or a failure — never both. */
export interface Observation {
  ok: boolean;
  output?: unknown;
  error?: string;
  /** Milliseconds the capability itself took. */
  durationMs: number;
  /** Cost units consumed by this single action. */
  cost: number;
}

/**
 * The result of a real check. A step is done when this says so.
 * `passed: false` must carry a reason — a check that fails silently is a
 * check that lies.
 */
export interface CheckResult {
  checkId: string;
  passed: boolean;
  reason: string;
  /** Anything the check wants preserved in evidence (measurements, diffs). */
  detail?: Record<string, unknown>;
}

/** Everything needed to believe the step's outcome. Gate: FR-8 / AC-8. */
export interface Evidence {
  stepId: string;
  capabilityId: string;
  capabilityVersion: string;
  attempts: number;
  /** Exit code convention: 0 pass, non-zero fail. */
  exitCode: number;
  durationMs: number;
  cost: number;
  /**
   * Artifacts this step NEWLY wrote to the store. Content-addressing means an
   * identical artifact already present is not re-created, so this can be empty
   * for a step that genuinely produced output — see producedArtifactIds.
   */
  artifactIds: ArtifactId[];
  /**
   * Every artifact this step produced, whether or not the write was new.
   * Always populated when the step returned an artifact id.
   *
   * Round 1 surfaced why both are needed: navigating the same page twice
   * yields byte-identical output, the store already holds that hash, and the
   * second step's `artifactIds` came back EMPTY — its evidence pointed at
   * nothing. The step did produce that content; that fact belongs in evidence
   * regardless of whether the write was new. Weakening content-addressing to
   * fix it would have been the wrong trade.
   */
  producedArtifactIds: ArtifactId[];
  /**
   * The step's own output, stored as an artifact, present only when the step
   * PASSED. This is what makes `$from` resolution survive a resume: the value a
   * later step references is read back from the store via this id, rather than
   * from a map of outputs the scheduler holds in memory for the length of one
   * process. A mission whose data flow lives in process memory is reproducible
   * only until something restarts.
   *
   * Serialising it is safe because of the output contract (#66): a declared
   * output is built from the descriptive constraint kinds, all of which are
   * JSON values.
   */
  outputArtifactId?: ArtifactId;
  checks: CheckResult[];
  /**
   * Hash of the step's resolved inputs — drives memoisation.
   *
   * "Resolved" is now literal: a step whose input holds `$from` references is
   * hashed AFTER they are replaced with real values, so two runs that reference
   * the same upstream output memoise together and a run whose upstream changed
   * does not.
   */
  inputHash: string;
  /**
   * True when the step failed AND the kernel actually restored its declared
   * radius (K2b). Absent means no rollback was needed or none was in scope.
   * Recorded because a rollback nobody can see is indistinguishable from one
   * that never ran.
   */
  rolledBack?: boolean;
}

/** A node in the mission DAG. One tool, one loop, one budget. */
export interface StepSpec {
  id: string;
  capabilityId: string;
  input: unknown;
  /** Step ids that must pass before this one may run. */
  dependsOn: string[];
  /** Check ids that must all pass for this step to be `passed`. */
  checks: string[];
  /** Overrides the capability's default budget. */
  budget?: Budget;
  /**
   * Named exclusive resources this step needs (one browser profile, one
   * worktree). The scheduler will not run two steps sharing a lock.
   */
  locks?: string[];
  /**
   * A failed step normally blocks its dependents. Setting this records the
   * failure in evidence and lets the graph continue — never silently.
   */
  continueOnError?: boolean;
  /**
   * Which agent owns this step.
   *
   * It is used for reporting, and for **repair-strategy lookup**: the scheduler
   * resolves a repair most-specific-first — step id, then this, then capability
   * id — so an agent can carry its recovery behaviour across every step it owns.
   *
   * It does NOT drive concurrency. That was the previous docstring's claim and
   * it was wrong in both directions: `maxParallel` is a per-mission number and
   * the scheduler's locks are keyed on `StepSpec.locks`, neither of which reads
   * this field. Nothing in the kernel groups work by agent.
   */
  agent?: string;
}

export interface StepState {
  spec: StepSpec;
  status: StepStatus;
  evidence?: Evidence;
  startedAt?: number;
  endedAt?: number;
}

export interface MissionSpec {
  id: string;
  objective: string;
  steps: StepSpec[];
  /** Max steps executing at once across the whole mission. */
  maxParallel?: number;
}

export interface MissionState {
  spec: MissionSpec;
  status: MissionStatus;
  steps: Record<string, StepState>;
}

/** A capability the broker can invoke. */
export interface Capability {
  manifest: CapabilityManifest;
  /**
   * Run the capability. `ctx` carries the permission-checked surfaces; a
   * capability must reach the outside world through it, never directly.
   */
  run(input: unknown, ctx: CapabilityContext): Promise<unknown>;
}

/**
 * The only door a capability has to the outside. Every method is
 * permission-checked against the capability's manifest before it does
 * anything, so a capability cannot exceed its declared blast radius.
 */
export interface CapabilityContext {
  netRead(url: string): Promise<string>;
  fsRead(path: string): Promise<string>;
  fsWrite(path: string, data: string): Promise<void>;
  /** Persist bytes and get back a content address. */
  putArtifact(data: string): Promise<ArtifactId>;
  readArtifact(id: ArtifactId): Promise<string>;
  /**
   * Runs a child process to completion (SERVICE-fate capabilities: the real
   * engine runs as its own process; OPTIMUS talks to it, never rewrites it).
   * Gated on `proc:spawn`. `input` is written to the process's stdin and the
   * stream closed, so the process can read a full request before acting.
   *
   * `timeoutMs` is enforced HERE, independently of the step's wall-time
   * budget — the harness only checks that budget between attempts, so a
   * single hung process could otherwise block past it. On timeout the
   * process is killed and this rejects; it never leaves an orphan running.
   */
  spawnProcess(spec: ProcessSpec): Promise<ProcessResult>;

  /**
   * Calls an already-running HTTP service (local or remote) and returns its
   * raw response — the primitive a SERVICE-fate capability needs when the
   * real engine is a long-lived server it talks to over and over, rather
   * than a one-shot process run to completion (that's `spawnProcess`).
   *
   * Permission is gated by method, same least-privilege split as fsRead vs
   * fsWrite: GET/HEAD need only `net:read`; anything that can carry a body
   * (POST/PUT/PATCH/DELETE) needs `net:write`. `timeoutMs` is enforced HERE
   * via AbortController, independently of the step's wall-time budget — same
   * reasoning as spawnProcess's own hard kill.
   */
  netFetch(request: NetFetchRequest): Promise<NetFetchResult>;
}

export interface ProcessSpec {
  command: string;
  args?: string[];
  /** Written to stdin, then the stream is closed. Omit for no stdin input. */
  input?: string;
  /** Hard kill ceiling for this one process — see spawnProcess's docstring. */
  timeoutMs: number;
  /** Additional environment variables, merged over a minimal safe base. */
  env?: Record<string, string>;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** True when spawnProcess killed the process for exceeding timeoutMs. */
  timedOut: boolean;
}

export interface NetFetchRequest {
  url: string;
  /** Defaults to "GET". */
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  /** Raw request body. Only meaningful for methods that permit one. */
  body?: string;
  /** Hard abort ceiling for this one call — see netFetch's docstring. */
  timeoutMs: number;
}

export interface NetFetchResult {
  /** 0 when timedOut is true — no real status was ever received. */
  status: number;
  headers: Record<string, string>;
  body: string;
  /** True when netFetch aborted the request for exceeding timeoutMs. */
  timedOut: boolean;
}

/** A check the verification spine can run. */
export interface Check {
  id: string;
  /**
   * `output` is whatever the capability returned. Checks must be able to
   * FAIL — a check that cannot fail is not a check.
   */
  run(output: unknown, ctx: CheckContext): Promise<CheckResult>;
}

export interface CheckContext {
  readArtifact(id: ArtifactId): Promise<string>;
}
