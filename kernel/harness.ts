/**
 * K4a — the agent harness. THE loop that makes OPTIMUS reliable rather than
 * hopeful (CLAUDE.md, "Every step is a loop. Every loop has a budget."):
 *
 *   attempt -> observe -> verify -> ┬ pass -> seal evidence, emit artifact
 *                                   └ fail -> diagnose -> repair -> attempt n+1
 *
 * Two rules are enforced here and nowhere else:
 *
 *   1. A step is done when a CHECK passes. Not when the capability returns
 *      without throwing, and not when a model says it looks right.
 *   2. Every loop terminates. maxAttempts, maxWallTimeMs and maxCost are all
 *      enforced, and exhausting any of them fails the step HONESTLY with its
 *      evidence attached, rather than retrying into the void.
 */

import type {
  Action,
  Budget,
  CheckResult,
  Evidence,
  Observation,
  StepSpec,
  StepStatus,
} from "./types";
import type { Broker } from "./broker";
import type { ArtifactStore } from "./artifacts";
import { hashInput } from "./artifacts";
import { createContext, type Fetcher } from "./permissions";
import { rollbackScope, snapshotTree, restoreTree } from "./rollback";

export interface HarnessDeps {
  broker: Broker;
  store: ArtifactStore;
  fetcher?: Fetcher;
  /** Injectable clock so budget tests don't sleep in real time. */
  now?: () => number;
  /** Reports each attempt so the scheduler can log it. */
  onAttempt?: (stepId: string, attempt: number) => void;
}

/**
 * Given a failed attempt, produce the input for the next one. This is the
 * "diagnose -> repair" arc. An agent supplies it; returning `undefined` means
 * "no repair possible", which ends the loop early rather than burning budget
 * re-running an identical attempt.
 */
export type Repair = (
  previousInput: unknown,
  observation: Observation,
  checks: CheckResult[],
) => unknown | undefined;

export interface StepOutcome {
  status: StepStatus;
  evidence: Evidence;
  /** Last successful output, present only when status is "passed". */
  output?: unknown;
}

export class Harness {
  constructor(private readonly deps: HarnessDeps) {}

  private get now(): () => number {
    return this.deps.now ?? Date.now;
  }

  /**
   * K2b, wired. A step that fails must not leave its half-finished work on
   * disk — CLAUDE.md: "revert a merge, including the parts that succeeded."
   *
   * The scope comes from the capability's OWN manifest (K4's writeRoots and
   * cwd), which is why this could not exist before the isolation boundary
   * did: `snapshot()`'s explicit watched-files list required the caller to
   * already know what a capability was about to touch. Nothing ever knew.
   *
   * Scope note, so it is not mistaken for more than it is: this restores
   * between STEPS, not between attempts inside one step's repair loop. A
   * retry currently starts from whatever the previous attempt left behind.
   */
  async runStep(spec: StepSpec, repair?: Repair): Promise<StepOutcome> {
    const roots = rollbackScope(this.deps.broker.capability(spec.capabilityId).manifest.isolation);
    const before = roots.length > 0 ? await snapshotTree(roots) : undefined;

    const outcome = await this.runStepUnprotected(spec, repair);

    if (before && outcome.status !== "passed") {
      outcome.evidence.rolledBack = await restoreTree(before);
    }
    return outcome;
  }

  private async runStepUnprotected(spec: StepSpec, repair?: Repair): Promise<StepOutcome> {
    const { broker, store, fetcher } = this.deps;
    const capability = broker.capability(spec.capabilityId);
    const manifest = capability.manifest;
    const budget: Budget = spec.budget ?? manifest.defaultBudget;

    const startedAt = this.now();
    const inputHash = hashInput(spec.input);

    let attempt = 0;
    let cost = 0;
    // Distinguishes "we stopped trying" from "we ran out of road". A step that
    // fails its check on its only permitted attempt has NOT exhausted a
    // budget — nothing ran away — and reporting it as budget-exhausted hides
    // the real verdict from whoever reads the trace.
    let gaveUp = false;
    let input = spec.input;
    let lastChecks: CheckResult[] = [];
    let lastError: string | undefined;
    const artifactIds: string[] = [];

    // Snapshot what already exists so evidence lists only what THIS step made.
    const preExisting = new Set(await store.list());

    while (attempt < budget.maxAttempts) {
      // Wall-clock is checked BEFORE starting another attempt, so a step
      // cannot begin work it has no budget to finish.
      if (this.now() - startedAt >= budget.maxWallTimeMs) {
        return this.seal(
          "budget-exhausted",
          spec,
          manifest,
          attempt,
          startedAt,
          cost,
          artifactIds,
          lastChecks,
          inputHash,
          `wall-time budget exhausted after ${attempt} attempt(s)`,
        );
      }

      attempt += 1;
      this.deps.onAttempt?.(spec.id, attempt);

      const action: Action = { capabilityId: spec.capabilityId, input, attempt };
      const observation = await this.invoke(action, capability, manifest, fetcher);
      cost += observation.cost;

      // Cost is checked after the fact — we can only know what an attempt
      // cost once it has run. Exceeding it stops the loop immediately.
      if (cost > budget.maxCost) {
        return this.seal(
          "budget-exhausted",
          spec,
          manifest,
          attempt,
          startedAt,
          cost,
          artifactIds,
          lastChecks,
          inputHash,
          `cost budget exhausted: ${cost} > ${budget.maxCost}`,
        );
      }

      // Collect any artifacts this attempt produced.
      for (const id of await store.list()) {
        if (!preExisting.has(id) && !artifactIds.includes(id)) artifactIds.push(id);
      }

      if (!observation.ok) {
        lastError = observation.error;
        lastChecks = [
          {
            checkId: "capability.completed",
            passed: false,
            reason: observation.error ?? "capability failed",
          },
        ];
      } else {
        // The capability returned. That is NOT done — run the real checks.
        lastChecks = await this.verify(spec, observation.output);
        if (lastChecks.every((c) => c.passed)) {
          return {
            ...this.seal(
              "passed",
              spec,
              manifest,
              attempt,
              startedAt,
              cost,
              artifactIds,
              lastChecks,
              inputHash,
            ),
            output: observation.output,
          };
        }
        lastError = lastChecks.find((c) => !c.passed)?.reason;
      }

      // diagnose -> repair. No repair function, or a repair that declines,
      // means further attempts would be identical: stop now. That is a
      // verdict, not an exhausted budget.
      if (!repair) {
        gaveUp = true;
        break;
      }
      const repaired = repair(input, observation, lastChecks);
      if (repaired === undefined) {
        gaveUp = true;
        break;
      }
      input = repaired;
    }

    // Only reaching the attempt ceiling WHILE still willing to retry counts as
    // budget exhaustion.
    const exhausted = !gaveUp && attempt >= budget.maxAttempts;
    return this.seal(
      exhausted ? "budget-exhausted" : "failed",
      spec,
      manifest,
      attempt,
      startedAt,
      cost,
      artifactIds,
      lastChecks,
      inputHash,
      exhausted
        ? `attempt budget exhausted after ${attempt} attempt(s): ${lastError ?? "no passing check"}`
        : lastError,
    );
  }

  /** Invoke inside the permission boundary; a throw becomes a failed observation. */
  private async invoke(
    action: Action,
    capability: ReturnType<Broker["capability"]>,
    manifest: ReturnType<Broker["manifest"]>,
    fetcher: Fetcher | undefined,
  ): Promise<Observation> {
    const context = createContext({
      capabilityId: manifest.id,
      granted: manifest.permissions,
      store: this.deps.store,
      fetcher,
      // Undeclared isolation reaches createContext as undefined and is treated
      // as DENY_ALL there — the fail-closed default lives in one place.
      isolation: manifest.isolation,
    });

    const began = this.now();
    try {
      const output = await capability.run(action.input, context);
      return { ok: true, output, durationMs: this.now() - began, cost: 1 };
    } catch (error) {
      // A permission denial arrives here like any other failure: the step
      // fails with the reason recorded, rather than the process dying.
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: this.now() - began,
        cost: 1,
      };
    }
  }

  private async verify(spec: StepSpec, output: unknown): Promise<CheckResult[]> {
    if (spec.checks.length === 0) {
      // A step with no checks can never be "done" under rule 1. Refusing it
      // here is what stops verification from quietly becoming optional.
      return [
        {
          checkId: "verification.declared",
          passed: false,
          reason: `step ${spec.id} declares no checks — a step is done only when a check passes`,
        },
      ];
    }

    const ctx = { readArtifact: (id: string) => this.deps.store.get(id) };
    const results: CheckResult[] = [];
    for (const checkId of spec.checks) {
      const check = this.deps.broker.check(checkId);
      try {
        results.push(await check.run(output, ctx));
      } catch (error) {
        results.push({
          checkId,
          passed: false,
          reason: `check threw: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return results;
  }

  private seal(
    status: StepStatus,
    spec: StepSpec,
    manifest: ReturnType<Broker["manifest"]>,
    attempts: number,
    startedAt: number,
    cost: number,
    artifactIds: string[],
    checks: CheckResult[],
    inputHash: string,
    failureReason?: string,
  ): StepOutcome {
    const evidence: Evidence = {
      stepId: spec.id,
      capabilityId: manifest.id,
      capabilityVersion: manifest.version,
      attempts,
      exitCode: status === "passed" ? 0 : 1,
      durationMs: this.now() - startedAt,
      cost,
      artifactIds,
      checks:
        failureReason && checks.length === 0
          ? [{ checkId: "budget", passed: false, reason: failureReason }]
          : checks,
      inputHash,
    };
    return { status, evidence };
  }
}
