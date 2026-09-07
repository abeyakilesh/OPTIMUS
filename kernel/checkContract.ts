/**
 * #71 — a check declares which capabilities it can verify.
 *
 * THE HOLE. `Check` was `{ id, run }` and nothing linked a check to the
 * capability whose output it understands. So this plan validated, ran, and was
 * guaranteed red:
 *
 *   { "id": "extract", "capabilityId": "html.extractTitle",
 *     "checks": ["browser.navigateSucceeded"] }
 *
 * `browser.navigateSucceeded` reads `output.text`; `html.extractTitle` returns
 * `{ title, artifactId }`. The mission burns its budget discovering something
 * the kernel could have refused before the first step ran. The plan compiler
 * could refuse an UNREGISTERED check and not an INAPPLICABLE one — which also
 * meant its prompt offered a model checks it had no legitimate use for.
 *
 * TWO KINDS, AND THE DISTINCTION IS NOT DECORATION. `planCompiler.ts` carried
 * a hardcoded `CHECK_APPLICABILITY` map as a stand-in and said what the real
 * answer had to be: *"'declares an artifactId output' is the rule #71 should
 * encode and this is the compiler's stand-in for it."* Both halves of that are
 * honoured here.
 *
 *   · `outputs` — applies to any capability declaring these output fields.
 *     DERIVED from #66's `outputs`, so it cannot go stale: absorb a sixth
 *     capability returning `artifactId` and `artifact.intact` covers it the
 *     moment it registers, with nothing to remember.
 *
 *   · `capabilities` — applies to exactly these ids. For checks whose meaning
 *     is tied to one capability rather than to a shape. `llm.chatSucceeded`
 *     and `browser.navigateSucceeded` BOTH read `ok`, so a field rule would
 *     make each apply to the other's capability — true about the shape, false
 *     about the meaning, and precisely the confusion this file exists to stop.
 *
 * A single mechanism was tried both ways and neither survives alone: ids-only
 * makes `artifact.intact` a list that goes stale on every absorption, and
 * fields-only cannot separate two checks that read the same field for
 * different reasons.
 *
 * DELIBERATELY NOT DERIVED FROM THE ID. `browser.navigateSucceeded` begins
 * with `browser.navigate` and `relocate.foundMatch` begins with neither.
 * Inferring the link from a name is `name-over-capability`, and the near-miss
 * already bit once in #74's own tests (`substring-vs-token-match`).
 */

import type { CapabilityManifest, Check } from "./types";
import type { MissionSpec } from "./types";

export class CheckContractError extends Error {}

/** Applies to any capability whose manifest declares all of these output fields. */
export interface OutputsApplicability {
  readonly kind: "outputs";
  readonly requires: readonly string[];
}

/** Applies to exactly these capability ids. */
export interface CapabilitiesApplicability {
  readonly kind: "capabilities";
  readonly ids: readonly string[];
}

export type CheckApplicability = OutputsApplicability | CapabilitiesApplicability;

/**
 * Throws unless the declaration is well-formed. Called by the broker at
 * registration, so a malformed one can never reach a plan.
 *
 * THE EMPTY LIST MEANS OPPOSITE THINGS IN THE TWO KINDS, and the first draft
 * of this file refused both with one message — a real bug, caught while
 * converting the test fixtures:
 *
 *   · `capabilities: { ids: [] }` matches NOTHING. Unreachable: a check no
 *     plan can ever legally name. Refused, because it reads as a declaration
 *     and enforces nothing — the `rule-without-mechanism` shape.
 *
 *   · `outputs: { requires: [] }` matches EVERYTHING, vacuously — every
 *     manifest declares all zero of the required fields. Allowed, because it
 *     is the honest declaration for a check that does not read the output at
 *     all. `always.passes` in the test suites is exactly that, and forcing it
 *     to name a field it never touches would be a lie told to satisfy a
 *     validator.
 *
 * The asymmetry is the point: one is unusable, the other is universal, and a
 * validator that treats "empty" as one concept gets one of them wrong.
 */
export function assertApplicability(applies: CheckApplicability, at: string): void {
  if (!applies || typeof applies !== "object" || Array.isArray(applies)) {
    throw new CheckContractError(
      `${at}: appliesTo must be an object — { kind: "outputs", requires: [...] } or ` +
        `{ kind: "capabilities", ids: [...] }`,
    );
  }

  if (applies.kind === "outputs") {
    // May be empty. See the block above.
    assertStrings(applies.requires, `${at}: appliesTo.requires`);
    return;
  }
  if (applies.kind === "capabilities") {
    assertStrings(applies.ids, `${at}: appliesTo.ids`);
    if (applies.ids.length === 0) {
      throw new CheckContractError(
        `${at}: appliesTo.ids is empty, so this check matches no capability and no plan could ` +
          `ever legally name it. For a check that reads nothing from the output, declare ` +
          `{ kind: "outputs", requires: [] } — that says "applies anywhere", which is a different claim`,
      );
    }
    return;
  }

  throw new CheckContractError(
    `${at}: appliesTo.kind must be "outputs" or "capabilities", got ` +
      JSON.stringify((applies as { kind?: unknown }).kind),
  );
}

function assertStrings(value: readonly string[], at: string): void {
  if (!Array.isArray(value)) {
    throw new CheckContractError(`${at} must be an array`);
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new CheckContractError(`${at} contains a non-string or empty entry`);
    }
  }
}

/**
 * Does this check understand what that capability returns?
 *
 * Pure, and takes a manifest rather than a broker, so the plan validator, the
 * compiler's prompt builder and the tests all ask exactly the same question.
 * Two callers computing applicability separately is how the compiler's
 * stand-in map drifted from the checks in the first place.
 */
export function checkAppliesTo(applies: CheckApplicability, manifest: CapabilityManifest): boolean {
  if (applies.kind === "capabilities") return applies.ids.includes(manifest.id);
  return applies.requires.every((field) =>
    Object.prototype.hasOwnProperty.call(manifest.outputs, field),
  );
}

/** The narrow slice of the broker this module needs. Structural, to avoid an import cycle. */
export interface CheckRegistry {
  check(id: string): Check;
  manifest(id: string): CapabilityManifest;
}

/**
 * PLAN TIME. Every step's checks must understand that step's capability.
 *
 * Called beside `validateReferences` — both answer "is this plan coherent
 * before anything runs", and both exist so a mission fails at the door rather
 * than three steps in with its budget half spent.
 *
 * `broker.check()` already throws for an unregistered id, so an unknown check
 * is refused before this asks about applicability; the two failures are
 * different and say so.
 */
export function validatePlanChecks(spec: MissionSpec, broker: CheckRegistry): void {
  for (const step of spec.steps) {
    const manifest = broker.manifest(step.capabilityId);
    for (const checkId of step.checks) {
      const check = broker.check(checkId); // throws if unregistered
      if (checkAppliesTo(check.appliesTo, manifest)) continue;

      throw new CheckContractError(
        `${step.id}: check "${checkId}" does not apply to "${step.capabilityId}" — ` +
          explain(check.appliesTo, manifest) +
          `. It would run and be guaranteed red, so the plan is refused instead`,
      );
    }
  }
}

/**
 * What a check DOES verify, phrased for a refusal message. Exported so the
 * plan validator and the compiler produce identical wording — two sites
 * describing the same rule in different words is how a reader learns to
 * distrust both.
 */
export function describeApplicability(applies: CheckApplicability): string {
  return applies.kind === "capabilities"
    ? applies.ids.join(", ")
    : `anything returning ${applies.requires.join(", ")}`;
}

function explain(applies: CheckApplicability, manifest: CapabilityManifest): string {
  if (applies.kind === "capabilities") {
    return `that check applies only to ${applies.ids.join(", ")}`;
  }
  const missing = applies.requires.filter(
    (f) => !Object.prototype.hasOwnProperty.call(manifest.outputs, f),
  );
  const declared = Object.keys(manifest.outputs);
  return (
    `it needs the output field(s) ${missing.join(", ")}, and "${manifest.id}" returns ` +
    (declared.length ? declared.join(", ") : "nothing")
  );
}

/**
 * The checks that legally pair with these capabilities — the compiler's
 * prompt list, derived rather than maintained.
 *
 * This replaces `planCompiler.ts`'s `CHECK_APPLICABILITY`, a second copy of
 * the same fact that the file itself flagged as temporary. A model offered a
 * check it cannot legitimately use is being offered a mistake.
 */
export function applicableCheckIds(
  manifests: readonly CapabilityManifest[],
  checks: readonly Check[],
): string[] {
  return checks
    .filter((c) => manifests.some((m) => checkAppliesTo(c.appliesTo, m)))
    .map((c) => c.id);
}
