/**
 * Gates 8-9 for the Scrapling absorption (issue #14): the capability
 * contract and broker adapter that make the ported relocate engine
 * (kernel/scrapling.ts) actually callable from a mission, instead of a
 * proven-but-unreachable module.
 *
 * `kernel/capabilities/` is where absorbed real capabilities live, as
 * opposed to `kernel/builtin.ts`, which stays the tiny walking-skeleton
 * toolset from WP-001.
 */

import type { Capability, Check, CheckResult } from "../types";
import { relocate, elementToDict, type ElementFingerprint } from "../scrapling";

export interface RelocateInput {
  fingerprint: ElementFingerprint;
  pageHtml: string;
  percentage?: number;
}

export interface RelocateOutput {
  found: boolean;
  score: number;
  /** Echoes the threshold that was actually applied, so the check below can
   *  verify the capability's own claim without re-running the algorithm. */
  percentage: number;
  matches: ElementFingerprint[];
  artifactId: string;
}

const DEFAULT_PERCENTAGE = 40;

/**
 * No fs/net permissions: this capability computes over HTML the caller
 * already fetched (typically by an earlier `web.fetch` step) — it has no
 * ambient authority to declare, and none is granted.
 */
export const scraplingRelocate: Capability = {
  manifest: {
    id: "scrapling.relocate",
    version: "0.4.9-port",
    permissions: [],
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 5000, maxCost: 5 },
    description:
      "Finds the element matching a saved fingerprint on a page, surviving " +
      "class/tag/structure changes. Ported from Scrapling 0.4.9's relocate().",
  },
  async run(input, ctx) {
    const { fingerprint, pageHtml, percentage = DEFAULT_PERCENTAGE } = input as RelocateInput;
    if (!fingerprint || typeof pageHtml !== "string") {
      throw new Error("scrapling.relocate requires { fingerprint, pageHtml }");
    }

    const result = relocate(fingerprint, pageHtml, percentage);
    const output: Omit<RelocateOutput, "artifactId"> = {
      found: Boolean(result),
      score: result?.score ?? 0,
      percentage,
      matches: (result?.matches ?? []).map((el) => elementToDict(el)),
    };

    const artifactId = await ctx.putArtifact(JSON.stringify(output));
    return { ...output, artifactId } satisfies RelocateOutput;
  },
};

/**
 * Verifies the capability HONOURED ITS OWN CONTRACT — not a re-run of the
 * algorithm (that would just prove the code agrees with itself), but the
 * invariant a caller actually depends on: a claimed match cannot be below
 * the threshold that was requested, and "found" cannot contradict the
 * match list. Catches the exact class of bug fault-injection exercises in
 * the test suite: a capability that returns `found: true` on a match that
 * doesn't actually clear the bar it was asked to clear.
 */
export const relocateContractHonored: Check = {
  id: "relocate.contractHonored",
  async run(output): Promise<CheckResult> {
    const result = output as Partial<RelocateOutput> | undefined;

    if (!result || typeof result.found !== "boolean" || typeof result.score !== "number") {
      return {
        checkId: "relocate.contractHonored",
        passed: false,
        reason: `malformed output: ${JSON.stringify(result)}`,
      };
    }

    if (result.found) {
      if (result.score < result.percentage!) {
        return {
          checkId: "relocate.contractHonored",
          passed: false,
          reason: `claimed found=true at score ${result.score}, below its own threshold ${result.percentage}`,
        };
      }
      if (!result.matches || result.matches.length === 0) {
        return {
          checkId: "relocate.contractHonored",
          passed: false,
          reason: "claimed found=true but returned zero matches",
        };
      }
    } else if (result.score >= result.percentage!) {
      return {
        checkId: "relocate.contractHonored",
        passed: false,
        reason: `claimed found=false but score ${result.score} clears threshold ${result.percentage}`,
      };
    }

    return {
      checkId: "relocate.contractHonored",
      passed: true,
      reason: result.found
        ? `found ${result.matches!.length} match(es) at score ${result.score} (threshold ${result.percentage})`
        : `honestly reported no match above ${result.percentage}`,
      detail: { found: result.found, score: result.score },
    };
  },
};
