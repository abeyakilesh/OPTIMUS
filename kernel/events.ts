/**
 * K3a — the event log, and the fold that rebuilds state from it.
 *
 * Live state is never the source of truth: the log is. AC-6 asserts that
 * folding the log reproduces live state exactly, which is what makes a run
 * replayable and auditable rather than merely logged.
 */

import type { Evidence, MissionSpec, MissionState, StepState, StepStatus } from "./types";

export type KernelEvent =
  | { type: "mission.proposed"; at: number; spec: MissionSpec }
  | { type: "mission.started"; at: number; missionId: string }
  | { type: "step.started"; at: number; stepId: string; agent?: string }
  | { type: "step.attempt"; at: number; stepId: string; attempt: number }
  | {
      type: "step.finished";
      at: number;
      stepId: string;
      status: StepStatus;
      evidence: Evidence;
    }
  | { type: "step.blocked"; at: number; stepId: string; because: string }
  /**
   * A step whose dependency failed but which is declared continue-on-error.
   * It is a DISTINCT event from `step.blocked`, because folding a blocked
   * event would mark the step blocked — the opposite of what happened.
   */
  | { type: "step.continued"; at: number; stepId: string; because: string }
  | { type: "mission.finished"; at: number; missionId: string; status: "green" | "red" }
  | { type: "mission.rolled-back"; at: number; missionId: string };

export class EventLog {
  private readonly events: KernelEvent[] = [];

  append(event: KernelEvent): void {
    this.events.push(event);
  }

  all(): readonly KernelEvent[] {
    return this.events;
  }

  /** Serialise for persistence or transport. */
  toJSON(): string {
    return JSON.stringify(this.events);
  }

  static fromJSON(json: string): EventLog {
    const log = new EventLog();
    for (const event of JSON.parse(json) as KernelEvent[]) log.append(event);
    return log;
  }
}

/**
 * Rebuild mission state from the log alone. Pure — no clock, no I/O, no
 * randomness — so the same log always folds to the same state.
 */
export function fold(events: readonly KernelEvent[]): MissionState | undefined {
  let state: MissionState | undefined;

  for (const event of events) {
    switch (event.type) {
      case "mission.proposed": {
        const steps: Record<string, StepState> = {};
        for (const spec of event.spec.steps) {
          steps[spec.id] = { spec, status: "pending" };
        }
        state = { spec: event.spec, status: "proposed", steps };
        break;
      }
      case "mission.started":
        if (state) state.status = "running";
        break;
      case "step.started": {
        const step = state?.steps[event.stepId];
        if (step) {
          step.status = "running";
          step.startedAt = event.at;
        }
        break;
      }
      case "step.attempt":
        // Attempt counts live in evidence; nothing to fold here. The event is
        // kept because a trace without attempts hides retry behaviour.
        break;
      case "step.finished": {
        const step = state?.steps[event.stepId];
        if (step) {
          step.status = event.status;
          step.evidence = event.evidence;
          step.endedAt = event.at;
        }
        break;
      }
      case "step.blocked": {
        const step = state?.steps[event.stepId];
        if (step) step.status = "blocked";
        break;
      }
      case "step.continued":
        // Recorded in the trace, but it changes no state: the step still runs
        // and its own outcome decides its status.
        break;
      case "mission.finished":
        if (state) state.status = event.status;
        break;
      case "mission.rolled-back":
        if (state) state.status = "rolled-back";
        break;
    }
  }

  return state;
}
