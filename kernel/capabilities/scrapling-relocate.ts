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
import { ARTIFACT_ID_OUTPUT, type OutputConstraint } from "../outputContract";
import type { Repair } from "../harness";
import { bestMatch, elementToDict, type ElementFingerprint } from "../scrapling";

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
 * The fingerprint shape as it comes BACK. Deliberately its own constant rather
 * than a reference to the input constraint above: the two differ in exactly
 * one way — nothing here is `required`, because `elementToDict` omits the
 * parent/sibling/child keys for an element with no element parent — and a
 * shared definition would hide that difference behind a spread.
 */
const FINGERPRINT_SHAPE: OutputConstraint = {
  kind: "object",
  fields: {
    tag: { kind: "string", required: true },
    attributes: { kind: "record", required: true, values: { kind: "string" } },
    text: { kind: "string", required: true, nullable: true },
    path: { kind: "array", required: true, of: { kind: "string" } },
    parentName: { kind: "string" },
    parentAttribs: { kind: "record", values: { kind: "string" } },
    parentText: { kind: "string", nullable: true },
    siblings: { kind: "array", of: { kind: "string" } },
    children: { kind: "array", of: { kind: "string" } },
  },
};

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
    // Pure computation over its inputs: no files, no network, no processes.
    // An empty radius is the honest declaration, not a placeholder — and
    // because it holds no permissions, the broker's radius check is vacuous.
    isolation: {},
    inputConstraints: {
      // A fingerprint is a captured DOM element, so its shape is the parent
      // repo's, not ours — mirrored field for field rather than waved through
      // as an object, because "we did not write this shape" is a reason to
      // pin it down, not a reason to skip it.
      fingerprint: {
        kind: "object",
        required: true,
        fields: {
          tag: { kind: "string", required: true, maxLength: 100 },
          attributes: { kind: "record", required: true, values: { kind: "string", maxLength: 100_000 }, maxEntries: 500 },
          text: { kind: "string", required: true, nullable: true, maxLength: 1_000_000 },
          path: { kind: "array", required: true, of: { kind: "string", maxLength: 100 }, maxLength: 500 },
          parentName: { kind: "string", maxLength: 100 },
          parentAttribs: { kind: "record", values: { kind: "string", maxLength: 100_000 }, maxEntries: 500 },
          parentText: { kind: "string", nullable: true, maxLength: 1_000_000 },
          siblings: { kind: "array", of: { kind: "string", maxLength: 100 }, maxLength: 5_000 },
          children: { kind: "array", of: { kind: "string", maxLength: 100 }, maxLength: 5_000 },
        },
      },
      pageHtml: { kind: "string", required: true, maxLength: 50_000_000 },
      percentage: { kind: "number", min: 0, max: 100 },
    },
    // `matches` is a list of the SAME fingerprint shape the input takes, so
    // the declaration is the input's field-for-field, minus the required
    // marks: `elementToDict` omits the parent/sibling/child keys entirely when
    // the element has no element parent, and an omitted key is absent, not
    // null. Declaring them required would fail every root-level match.
    outputs: {
      found: { kind: "boolean", required: true },
      // 0-100 by construction: the port accumulates one 0..1 term per check
      // and divides by the number of checks (kernel/scrapling.ts).
      score: { kind: "number", required: true, min: 0, max: 100 },
      percentage: { kind: "number", required: true, min: 0, max: 100 },
      matches: { kind: "array", required: true, of: FINGERPRINT_SHAPE },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
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

    // `score` reports the BEST candidate found, whether or not it cleared the
    // threshold. It used to be `result?.score ?? 0`, which meant every missed
    // relocation reported 0 — a sentinel dressed as a measurement. Two things
    // broke because of it: an informed repair could not tell a near miss from
    // nothing at all, and `relocateContractHonored`'s found=false branch
    // (`score >= percentage` must not hold) could never fire, because 0 is
    // below every threshold. A check that cannot fail is not a check.
    const best = bestMatch(fingerprint, pageHtml);
    const found = Boolean(best) && best!.score >= percentage;
    const output: Omit<RelocateOutput, "artifactId"> = {
      found,
      score: best?.score ?? 0,
      percentage,
      // Matches are only returned when the threshold was actually met: a
      // sub-threshold candidate is a diagnostic, not a result.
      matches: found ? best!.matches.map((el) => elementToDict(el)) : [],
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

/**
 * The floor a repair may never go below — set from MEASURED noise, not taste.
 *
 * The golden fixture's `unrelated-element` case scores **49.63**: a
 * `<div class="price">$899</div>` fingerprint against
 * `<a href="/about">About</a>` inside a nav. Different tag, different
 * attributes, different text, unrelated content — and it clears 49.
 *
 * So any threshold at or below ~50 is inside the noise. A repair that relaxed
 * to 35 because "the best candidate scored 35" would be handing back whatever
 * element happened to sit closest, with a number that looks like evidence.
 *
 * ⚠️ This has a consequence larger than the repair, and it is filed rather
 * than hidden here: **Scrapling's own default threshold is 40**, which is
 * BELOW the noise floor this fixture demonstrates. `scrapling.relocate` at
 * default settings can return an unrelated element and report it as found.
 * That is a property of the parent algorithm, faithfully ported — see the
 * calibration issue. The repair refuses to make it worse.
 */
export const MIN_PERCENTAGE = 50;

/**
 * The most a single repair may relax the caller's threshold. The floor alone
 * is not enough: a caller who asked for 90 and gets handed a 51% match has had
 * their question replaced, not answered. Bounded relaxation keeps the repair
 * an adaptation rather than a redefinition.
 *
 * Together with the floor this means a caller sitting on the DEFAULT threshold
 * gets no repair at all — 40 is already under the noise floor, so there is
 * nothing safe to relax to, and the step fails honestly instead. The repair is
 * for the caller who asked for 85 and got 72.
 */
export const MAX_RELAXATION = 15;

/**
 * Did the step achieve what the CALLER wanted — the element located?
 *
 * Deliberately separate from `relocate.contractHonored`, which asks a
 * different question: did the capability tell the truth. Those come apart
 * exactly where it matters. `found: false` with an honest score is a PASS for
 * the contract (the capability reported accurately) and a FAIL here (the
 * mission wanted the element). Without this check nothing ever fails on a
 * missed relocation, so the repair loop below would never run — a repair
 * attached to a step whose checks always pass is decoration.
 */
export const relocateFoundMatch: Check = {
  id: "relocate.foundMatch",
  async run(output): Promise<CheckResult> {
    const r = output as Partial<RelocateOutput> | undefined;
    if (!r || typeof r.found !== "boolean" || typeof r.score !== "number") {
      return { checkId: "relocate.foundMatch", passed: false, reason: `malformed output: ${JSON.stringify(r)}` };
    }
    if (!r.found) {
      return {
        checkId: "relocate.foundMatch",
        passed: false,
        reason: `no element scored above ${r.percentage}; best candidate was ${r.score}`,
        detail: { bestScore: r.score, threshold: r.percentage },
      };
    }
    return {
      checkId: "relocate.foundMatch",
      passed: true,
      // States the threshold ACTUALLY APPLIED, which is how a relaxed find
      // stays visible: compare it against the percentage in the step's input.
      reason: `located the element at score ${r.score} (threshold applied: ${r.percentage})`,
      detail: { score: r.score, thresholdApplied: r.percentage },
    };
  },
};

/**
 * The repair arc for a missed relocation — the one Scrapling's whole premise
 * is about. A page changed, the saved fingerprint no longer scores above the
 * caller's threshold, and the honest question is whether it *nearly* did.
 *
 * This is an INFORMED repair, not a retry. It reads the best score the last
 * attempt actually achieved and lowers the threshold to exactly that, so the
 * next attempt either succeeds or the element genuinely is not there. Blindly
 * retrying the same input would burn the budget re-deriving the same number.
 *
 * WHAT IT REFUSES TO DO, and why each matters more than what it does:
 *
 *   · **It never repairs a contract violation.** If `relocate.contractHonored`
 *     failed, the capability claimed a match below its own bar — our port
 *     lying about its result. Lowering the threshold would make that lie
 *     *true* and the check pass, converting a real defect into a green step.
 *
 *     ⚠️ **This branch is currently UNREACHABLE, and saying so is the point.**
 *     Mutation-testing it (delete the branch, expect red) left all 12 tests
 *     green. Working through why: a contract failure with `found: true` is
 *     already stopped by the found-guard below; a contract failure with
 *     `found: false` requires `score >= percentage`, which forces
 *     `next >= current` and declines anyway. Every path is covered by another
 *     guard, so this one is defence-in-depth, not the load-bearing check the
 *     first draft of this comment claimed it was. It stays because the guards
 *     below may change and this invariant must not depend on their order —
 *     but it is not tested, because it cannot be, and an untested branch
 *     described as critical is exactly the overclaim THE MUTATION RULE exists
 *     to catch.
 *   · **It never relaxes below MIN_PERCENTAGE**, where similarity is noise.
 *   · **It never relaxes by more than MAX_RELAXATION** in one step, so a
 *     caller's threshold is adapted, not discarded.
 *   · **It never raises or repeats a threshold** — no progress means the loop
 *     would spend the whole budget on identical attempts.
 *
 * The relaxation is visible rather than silent: the output echoes the
 * `percentage` actually applied, `relocate.foundMatch` names it in its reason,
 * and the step spec still records what the caller asked for. A reader
 * comparing the two sees the adaptation. Nothing here can make a 35% match
 * look like it cleared 40.
 */
export const relocateRepair: Repair = (previousInput, observation, checks) => {
  const contract = checks.find((c) => c.checkId === "relocate.contractHonored");
  if (contract && !contract.passed) return undefined;

  if (!observation.ok) return undefined;

  const out = observation.output as Partial<RelocateOutput> | undefined;
  const input = previousInput as RelocateInput | undefined;
  if (!out || !input || typeof out.score !== "number") return undefined;

  // Already found: nothing to repair. A repair that fires on success would
  // relax a threshold that was working.
  if (out.found) return undefined;

  const current = typeof input.percentage === "number" ? input.percentage : DEFAULT_PERCENTAGE;
  const floor = Math.max(MIN_PERCENTAGE, current - MAX_RELAXATION);

  // The best candidate cannot reach even the relaxed bar, so a retry would
  // fail identically. Decline and let the step fail honestly with its
  // evidence rather than burn another attempt.
  if (out.score < floor) return undefined;

  const next = Math.max(floor, out.score);
  if (next >= current) return undefined;

  return { ...input, percentage: next } satisfies RelocateInput;
};
