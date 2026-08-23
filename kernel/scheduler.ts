/**
 * K4b — the execution scheduler. This is the multi-agent part.
 *
 * A mission is a DAG of harness loops. Independent steps run in PARALLEL,
 * potentially owned by different agents; a failed step fails its dependents
 * unless explicitly marked continue-on-error (recorded in evidence, never
 * silent). The scheduler owns ordering, parallelism and resource locks.
 *
 * Mapping from CLAUDE.md:
 *   merge queue        -> this scheduler
 *   concurrency group  -> `locks` on a StepSpec
 *   paths-filter       -> memoisation on input hash
 *   branch protection  -> nothing applies while any step is red
 */

import type { MissionSpec, MissionState, StepSpec, StepState } from "./types";
import { EventLog, fold, type KernelEvent } from "./events";
import { Harness, type Repair } from "./harness";

export class SchedulerError extends Error {}

export interface SchedulerDeps {
  harness: Harness;
  now?: () => number;
  /** Per-step repair strategies, keyed by step id or by agent name. */
  repairs?: Record<string, Repair>;
  /**
   * Memoised results from previous runs, keyed by input hash. A hit skips the
   * step entirely — the `paths-filter` analogue.
   */
  memo?: Map<string, string>;
}

export interface MissionResult {
  state: MissionState;
  log: EventLog;
  /** True only when every step that ran ended `passed`. */
  green: boolean;
}

/**
 * Validate the graph before running any of it. A mission that references a
 * missing dependency or contains a cycle must be rejected up front, not
 * discovered half-executed.
 */
export function validateGraph(spec: MissionSpec): void {
  const ids = new Set(spec.steps.map((s) => s.id));
  if (ids.size !== spec.steps.length) {
    throw new SchedulerError("Duplicate step ids in mission");
  }

  for (const step of spec.steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) {
        throw new SchedulerError(`Step ${step.id} depends on unknown step ${dep}`);
      }
    }
  }

  // Depth-first cycle detection. white/grey/black colouring.
  const state = new Map<string, "white" | "grey" | "black">();
  for (const id of ids) state.set(id, "white");
  const byId = new Map(spec.steps.map((s) => [s.id, s]));

  const visit = (id: string, path: string[]): void => {
    const colour = state.get(id);
    if (colour === "black") return;
    if (colour === "grey") {
      throw new SchedulerError(`Cycle in mission graph: ${[...path, id].join(" -> ")}`);
    }
    state.set(id, "grey");
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep, [...path, id]);
    state.set(id, "black");
  };

  for (const id of ids) visit(id, []);
}

export class Scheduler {
  constructor(private readonly deps: SchedulerDeps) {}

  private get now(): () => number {
    return this.deps.now ?? Date.now;
  }

  async run(spec: MissionSpec): Promise<MissionResult> {
    validateGraph(spec);

    const log = new EventLog();
    const emit = (event: KernelEvent): void => log.append(event);

    emit({ type: "mission.proposed", at: this.now(), spec });
    emit({ type: "mission.started", at: this.now(), missionId: spec.id });

    const status = new Map<string, StepState["status"]>();
    for (const step of spec.steps) status.set(step.id, "pending");

    const maxParallel = Math.max(1, spec.maxParallel ?? spec.steps.length);
    const heldLocks = new Set<string>();
    const running = new Map<string, Promise<void>>();
    const continuedNoted = new Set<string>();

    // A dependency is satisfied when it passed or was memoised away. A FAILED
    // dependency also counts as satisfied for a continue-on-error step —
    // otherwise the step would sit pending forever, which is what
    // continue-on-error exists to prevent.
    const dependenciesSatisfied = (step: StepSpec): boolean =>
      step.dependsOn.every((d) => {
        const s = status.get(d);
        if (s === "passed" || s === "skipped") return true;
        const settledBadly = s === "failed" || s === "budget-exhausted" || s === "blocked";
        return Boolean(step.continueOnError) && settledBadly;
      });

    const dependencyFailed = (step: StepSpec): string | undefined =>
      step.dependsOn.find((d) => {
        const s = status.get(d);
        return s === "failed" || s === "budget-exhausted" || s === "blocked";
      });

    const locksFree = (step: StepSpec): boolean =>
      (step.locks ?? []).every((l) => !heldLocks.has(l));

    // Keep scheduling until nothing is pending and nothing is in flight.
    for (;;) {
      // 1. Block anything whose dependency has failed. Do this first so a
      //    failure propagates before we consider launching more work.
      let changed = false;
      for (const step of spec.steps) {
        if (status.get(step.id) !== "pending") continue;
        const failedDep = dependencyFailed(step);
        if (failedDep === undefined) continue;

        if (step.continueOnError) {
          // Recorded, never silent: the graph continues but the trace says why.
          // Emitted at most once — this scan re-runs every scheduling pass, and
          // the step stays pending until it launches.
          if (!continuedNoted.has(step.id)) {
            continuedNoted.add(step.id);
            emit({
              type: "step.continued",
              at: this.now(),
              stepId: step.id,
              because: `dependency ${failedDep} failed; continue-on-error, running anyway`,
            });
          }
        } else {
          status.set(step.id, "blocked");
          emit({
            type: "step.blocked",
            at: this.now(),
            stepId: step.id,
            because: `dependency ${failedDep} did not pass`,
          });
          changed = true;
        }
      }
      if (changed) continue;

      // 2. Launch every ready step that fits under the parallelism cap and
      //    whose locks are free.
      for (const step of spec.steps) {
        if (running.size >= maxParallel) break;
        if (status.get(step.id) !== "pending") continue;
        if (!dependenciesSatisfied(step)) continue;
        if (!locksFree(step)) continue;

        status.set(step.id, "running");
        for (const lock of step.locks ?? []) heldLocks.add(lock);
        emit({ type: "step.started", at: this.now(), stepId: step.id, agent: step.agent });

        const task = this.execute(step, emit)
          .then((finalStatus) => {
            status.set(step.id, finalStatus);
          })
          .finally(() => {
            for (const lock of step.locks ?? []) heldLocks.delete(lock);
            running.delete(step.id);
          });

        running.set(step.id, task);
      }

      if (running.size === 0) {
        // Nothing running and nothing launchable — either we're done, or the
        // remainder is deadlocked behind failures. Either way, stop.
        const stillPending = spec.steps.some((s) => status.get(s.id) === "pending");
        if (!stillPending) break;
        const anyRunnable = spec.steps.some(
          (s) => status.get(s.id) === "pending" && dependenciesSatisfied(s),
        );
        if (!anyRunnable) break;
        continue;
      }

      // Wait for the FIRST step to finish, then re-evaluate — that is what
      // lets a fast step release its lock and start the next one immediately.
      await Promise.race(running.values());
    }

    // Drain anything still in flight.
    await Promise.all(running.values());

    const green = spec.steps.every((s) => {
      const st = status.get(s.id);
      return st === "passed" || st === "skipped";
    });

    emit({
      type: "mission.finished",
      at: this.now(),
      missionId: spec.id,
      status: green ? "green" : "red",
    });

    const state = fold(log.all());
    if (!state) throw new SchedulerError("Fold produced no state");
    return { state, log, green };
  }

  private async execute(
    step: StepSpec,
    emit: (event: KernelEvent) => void,
  ): Promise<StepState["status"]> {
    // A repair strategy may be registered for one specific step, or for a
    // whole agent — so an agent can carry its own repair behaviour across
    // every step it owns.
    const repair =
      this.deps.repairs?.[step.id] ??
      (step.agent ? this.deps.repairs?.[step.agent] : undefined);

    const outcome = await this.deps.harness.runStep(step, repair);
    emit({
      type: "step.finished",
      at: this.now(),
      stepId: step.id,
      status: outcome.status,
      evidence: outcome.evidence,
    });
    return outcome.status;
  }
}
