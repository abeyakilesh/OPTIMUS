/**
 * #63 — how a check knows what it knows.
 *
 * THE GAP. `CheckResult` was `{ checkId, passed, reason, detail? }`. A check
 * that concluded something **by inspecting a value** and a check that **ran the
 * thing and watched it behave** produced structurally identical evidence.
 * `passed: true` is `passed: true`. Nothing downstream — the mission log, gate
 * 7's proof scoring, the Absorption Score's Proof-coverage component — could
 * tell them apart, because the distinction was recorded nowhere.
 *
 *   Atlas 1.0 §14: *"Do not claim stronger evidence than actually exists."*
 *
 * That sentence is the whole issue. The kernel had no way to express the claim,
 * so it had no way to overstate it — and no way to check it. This is THE
 * COUNTING RULE applied to proof instead of to a number: a count that does not
 * name its method defaults to the weakest label its evidence supports; a check
 * that did not name its method defaulted to *looking exactly like the
 * strongest*.
 *
 * THREE VALUES, NOT THE ATLAS'S SEVEN, and the precedent is `provenance.ts`:
 * "a vocabulary with more values than the system can tell apart is the
 * `advertised-not-measured` defect wearing a taxonomy." The Atlas grades
 * research claims (A Logical · B Documentation · C Source · D Experimental ·
 * E Benchmark · F Production · G Consensus). Four of those the kernel cannot
 * produce today and shipping them would be a taxonomy of empty boxes:
 *
 *   · B Documentation — nothing reads authoritative docs as evidence.
 *   · C Source        — no check inspects an implementation; they inspect
 *                       OUTPUT. `relocate.contractHonored` comes closest and is
 *                       still reasoning over a returned value.
 *   · F Production    — no real operational telemetry exists to confirm from.
 *   · G Consensus     — nothing cross-references independent sources.
 *
 * What remains maps cleanly onto what checks actually do, and deliberately
 * echoes THE COUNTING RULE's own trio (advertised · measured · sampled): the
 * label names the METHOD, not the confidence.
 *
 * A DECLARED SET, NOT A RANK. #63 asked whether the type belongs on the check
 * or on the result. It is both, and the split is the mechanism:
 *
 *   · `Check.verification` — the methods this check may EVER use. Declared at
 *     registration, refused if empty.
 *   · `CheckResult.verification` — the method THIS run actually used. Refused
 *     by the harness if it is not one the check declared.
 *
 * A check whose method never varies declares one value and returns it every
 * time. A check whose reach varies declares both and reports honestly — gate
 * 11's fidelity harness is exactly that shape already: it re-runs CPython's
 * difflib where the parent is available and integrity-pins Scrapling's where it
 * is not, and "prints which is which on every run".
 *
 * A SET RATHER THAN AN ORDERING is the deliberate half. Ranking these would
 * require asserting that `measured` beats `observed`, which is not true in
 * general — they answer different questions, and a fake total order would be
 * exactly the invented precision this file exists to prevent. "Do not claim
 * stronger evidence than actually exists" is enforced here as **do not claim a
 * method you do not have**, which is checkable; "stronger" is not.
 */

export class VerificationError extends Error {}

/**
 * · `reasoned`  — concluded from the value itself. The check read what came
 *                 back and decided. No part of the system was exercised to
 *                 find out. (`title.nonEmpty` looks at a string.)
 * · `observed`  — the check EXERCISED something and watched the result. It
 *                 re-read, re-derived or re-ran, and the conclusion rests on
 *                 what happened rather than on what was returned.
 *                 (`artifact.intact` reads bytes back through a store that
 *                 re-derives the address on read.)
 * · `measured`  — a quantity was measured and compared to a threshold. The
 *                 number, and the threshold, belong in `detail`.
 */
export const VERIFICATION_TYPES = ["reasoned", "observed", "measured"] as const;

export type VerificationType = (typeof VERIFICATION_TYPES)[number];

/** The methods a check may report. Declared per check; non-empty. */
export type VerificationMethods = readonly VerificationType[];

function isType(value: unknown): value is VerificationType {
  return typeof value === "string" && (VERIFICATION_TYPES as readonly string[]).includes(value);
}

/**
 * Throws unless a check's declaration is well-formed. Called by the broker at
 * registration, so a malformed one never reaches a mission.
 *
 * EMPTY IS REFUSED, and unlike `appliesTo`'s two kinds there is no reading
 * under which it is meaningful: a check that may use no method cannot produce
 * a result at all, so every run of it would fail the harness.
 */
export function assertVerificationMethods(methods: VerificationMethods, at: string): void {
  if (!Array.isArray(methods) || methods.length === 0) {
    throw new VerificationError(
      `${at}: verification must be a non-empty array of ${VERIFICATION_TYPES.join(" | ")}. ` +
        `A check that declares no method can never return a result the harness accepts`,
    );
  }
  for (const m of methods) {
    if (!isType(m)) {
      throw new VerificationError(
        `${at}: "${String(m)}" is not a verification method. Legal values are ` +
          VERIFICATION_TYPES.join(" | "),
      );
    }
  }
}

/**
 * RUN TIME. The method a result claims must be one the check said it could use.
 *
 * This is the half with teeth. Without it `verification` is a label a check
 * writes about itself, which is the same shape as the `trust` tag before #70:
 * present, required, and unable to tell whether it is true. It cannot verify
 * that a check calling itself `observed` really observed anything — nothing
 * can, short of instrumenting the check — but it does stop a check claiming a
 * method it never declared, which is where the drift would start.
 */
export function assertResultMethod(
  declared: VerificationMethods,
  claimed: unknown,
  at: string,
): asserts claimed is VerificationType {
  if (!isType(claimed)) {
    throw new VerificationError(
      `${at}: result declares verification ${JSON.stringify(claimed)}, which is not one of ` +
        VERIFICATION_TYPES.join(" | "),
    );
  }
  if (!declared.includes(claimed)) {
    throw new VerificationError(
      `${at}: result claims verification "${claimed}", which this check did not declare. ` +
        `It declared: ${declared.join(", ")}. Atlas §14 — do not claim stronger evidence than ` +
        `actually exists`,
    );
  }
}

/**
 * How the evidence reads it back. Short on purpose: this sits beside a check's
 * reason in a mission log, and a long label pushes the reason off the line.
 */
export function describeVerification(type: VerificationType): string {
  return type;
}
