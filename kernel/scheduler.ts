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
import { referencesIn, resolveInput, validateReferences } from "./references";

export class SchedulerError extends Error {}

export interface SchedulerDeps {
  harness: Harness;
  now?: () => number;
  /**
   * Repair strategies, resolved most-specific first: step id, then agent
   * name, then CAPABILITY id. The last is how a repair travels with the
   * capability it understands — `scrapling.relocate` knows what to do about a
   * missed relocation, and no caller should have to re-supply that knowledge
   * at every call site. `kernel/registry.ts` exports ALL_REPAIRS for this.
   */
  repairs?: Record<string, Repair>;
  /**
   * Memoised results from previous runs, keyed by input hash. A hit skips the
   * step entirely — the `paths-filter` analogue.
   */
  memo?: Map<string, string>;
  /**
   * Fired for every event as it's emitted, not just at the end — lets a
   * caller persist or stream real progress (a live execution view) instead
   * of only seeing the final EventLog once the whole mission is done.
   */
  onEvent?: (event: KernelEvent) => void;
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
    // Two different questions, both answered before anything runs. validateGraph
    // asks whether the SHAPE is a runnable DAG; this asks whether the data flow
    // is real — every reference names a step that exists, that this step
    // depends on, and an output field that step's capability actually declares.
    // The last of those became answerable in #66 and is the reason B0 came
    // first: without it a reference could only fail at runtime, several steps
    // into a mission, as an `undefined`.
    validateReferences(spec, this.deps.harness.broker);

    const log = new EventLog();
    const emit = (event: KernelEvent): void => {
      log.append(event);
      this.deps.onEvent?.(event);
    };

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

        const task = this.execute(step, emit, log)
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

  /**
   * The producing step's output, read back from the artifact store via the LOG
   * — not from a map this scheduler holds.
   *
   * The distinction is the whole of D3 and it is not pedantry: a map of values
   * lives exactly as long as this process, so a mission resumed from its log
   * would resolve every reference to `undefined` while every gate stayed green.
   * The log holds `evidence.outputArtifactId`; the store holds the bytes; both
   * outlive the run.
   */
  private async readOutput(stepId: string, log: EventLog): Promise<unknown> {
    for (const event of log.all()) {
      if (event.type !== "step.finished" || event.stepId !== stepId) continue;
      const id = event.evidence.outputArtifactId;
      if (!id) return undefined;
      return JSON.parse(await this.deps.harness.store.get(id));
    }
    return undefined;
  }

  /** The id alone, for the trace. Same source as readOutput — the log. */
  private async outputArtifactOf(stepId: string, log: EventLog): Promise<string | undefined> {
    for (const event of log.all()) {
      if (event.type === "step.finished" && event.stepId === stepId) {
        return event.evidence.outputArtifactId;
      }
    }
    return undefined;
  }

  private async execute(
    step: StepSpec,
    emit: (event: KernelEvent) => void,
    log: EventLog,
  ): Promise<StepState["status"]> {
    // A repair strategy may be registered for one specific step, for a whole
    // agent — so an agent carries its repair behaviour across every step it
    // owns — or for a capability, so the knowledge of how to recover from a
    // given capability's failure lives with that capability. Most specific
    // wins, so a step can always override.
    const repair =
      this.deps.repairs?.[step.id] ??
      (step.agent ? this.deps.repairs?.[step.agent] : undefined) ??
      this.deps.repairs?.[step.capabilityId];

    // Resolve `$from` before the harness sees the step. Deliberately outside
    // the attempt loop: a reference points at an upstream step's sealed output,
    // which cannot change between this step's attempts. A repair rewrites input
    // INSIDE the loop and is re-validated there — different concern, already
    // handled.
    let resolvedInput: unknown;
    try {
      resolvedInput = await resolveInput(step.input, (id) => this.readOutput(id, log));
    } catch (error) {
      // A step whose input cannot be assembled is a FAILED step, not a crashed
      // mission. Letting this throw discarded the whole event log — every step
      // that had already passed, with its evidence — because `run()` never
      // returned a MissionResult. Found by this feature's own mutation test.
      const outcome = this.deps.harness.failBeforeRun(
        step,
        "input.unresolvable",
        error instanceof Error ? error.message : String(error),
      );
      emit({
        type: "step.finished",
        at: this.now(),
        stepId: step.id,
        status: outcome.status,
        evidence: outcome.evidence,
      });
      return outcome.status;
    }

    if (resolvedInput !== step.input) {
      emit({
        type: "step.resolved",
        at: this.now(),
        stepId: step.id,
        resolved: await Promise.all(
          referencesIn(step.input, `${step.id}.input`).map(async ({ at, ref }) => ({
            at,
            from: `${ref.stepId}.${ref.field}`,
            outputArtifactId: (await this.outputArtifactOf(ref.stepId, log)) ?? "",
          })),
        ),
      });
    }

    const outcome = await this.deps.harness.runStep(
      resolvedInput === step.input ? step : { ...step, input: resolvedInput },
      repair,
    );
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
