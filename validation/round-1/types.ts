import type { Evidence, StepStatus } from "../../kernel/types";

/**
 * A validation scenario is NOT a unit test. CLAUDE.md's VALIDATION ROUNDS:
 * gates ask "did this pass its checks?"; a round asks "does it actually do
 * the thing, on real input, with output a person reads."
 *
 * So every scenario records what a human should see, prints the real observed
 * output, and reaches its verdict from that output — never from a mock.
 */
export interface Scenario {
  id: string;
  /** What a person is actually checking here, in their words. */
  intent: string;
  input: unknown;
  /** Check ids to run — the real ones from the capability's own contract. */
  checks: string[];
  /**
   * Decide the verdict from the REAL result, and return what was observed so
   * the report shows evidence rather than a bare tick.
   */
  verdict(result: ScenarioResult): { ok: boolean; observed: string };
}

export interface ScenarioResult {
  status: StepStatus;
  evidence: Evidence;
  output: unknown;
  /** Set when the capability threw instead of returning. */
  threw?: string;
}
