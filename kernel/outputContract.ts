/**
 * The fourth leg of gate 8 — what a capability RETURNS.
 *
 * A manifest already declares what a capability may do (`permissions`), where
 * (`isolation`), and what it may be asked to do (`inputConstraints`). None of
 * those says what comes back, and until now nothing did:
 *
 *   $ grep -n "outputConstraints\|outputSchema\|outputs" kernel/types.ts
 *   (no matches)
 *
 * That absence is load-bearing for the next two PRs. `$from` reference
 * resolution wants to reject `{"$from": "fetch.title"}` while the plan is
 * being validated rather than three steps into a mission, and the plan
 * compiler would otherwise have to read field names out of a capability's
 * prose `description`. Both need a machine-readable answer to "what does this
 * step produce".
 *
 * WHY THIS REUSES THE INPUT CONSTRAINT VOCABULARY. The engine in
 * `./inputContract.ts` is already a small closed set of kinds, already linear
 * in the size of the value, already compiles no patterns, and already refuses
 * undeclared fields. A second schema language would be a second thing to keep
 * true. So the kinds are shared and the SEMANTICS are not — see below.
 *
 * WHY TWO KINDS ARE REFUSED HERE. `url` and `executable` exist to RESTRICT a
 * value the kernel is about to act on: refuse the host before a request is
 * assembled around it, refuse the binary before `spawn()` sees it. An output
 * is not acted on — it already happened. A `url` constraint on an output could
 * only ever produce a late, spurious step failure while READING as a security
 * boundary, which is `rule-without-mechanism` wearing a security-shaped name.
 * So they are refused at registration, with the reason said out loud.
 *
 * The type below excludes them at the top level; nesting is typed by
 * `inputContract.ts` and cannot be narrowed the same way, so the recursive
 * walk in `assertOutputs` is what actually covers a `url` buried inside an
 * object or an array. Stated rather than implied, because a type that looks
 * like it enforces something it doesn't is the whole subject of this file's
 * neighbours.
 */

import {
  assertConstraints,
  checkInput,
  InputContractError,
  type ExecutableConstraint,
  type InputConstraint,
  type UrlConstraint,
} from "./inputContract";
import { TRUST_LEVELS, type Trust } from "./provenance";

/** Every constraint kind except the two that exist to restrict rather than describe. */
export type OutputConstraint = Exclude<InputConstraint, UrlConstraint | ExecutableConstraint>;

/**
 * The fields a capability's output carries. Like `InputConstraints`, this is a
 * CLOSED set: a capability that returns a field its manifest does not declare
 * fails, rather than quietly carrying a field no `$from` could ever name and
 * no reader of the manifest knows exists.
 *
 * `{}` is meaningful and correct for a capability that returns nothing —
 * it says "the output must be empty", not "anything goes".
 */
export type OutputConstraints = Readonly<Record<string, OutputConstraint>>;

const DESCRIPTIVE_ONLY = new Set(["url", "executable"]);

function assertDescriptive(c: InputConstraint, at: string): void {
  if (!c || typeof c !== "object") return; // assertConstraints reports the real error
  if (DESCRIPTIVE_ONLY.has(c.kind)) {
    throw new InputContractError(
      `${at}: "${c.kind}" is an input-only kind. It exists to refuse a value before the kernel acts ` +
        `on it; an output has already been produced, so the same declaration here can only fail a ` +
        `step late while reading as a boundary. Describe the shape instead (string / number / …)`,
    );
  }
  if (c.kind === "array") assertDescriptive(c.of, `${at}[]`);
  else if (c.kind === "record") assertDescriptive(c.values, `${at}{}`);
  else if (c.kind === "object") {
    for (const field of Object.keys(c.fields)) assertDescriptive(c.fields[field], `${at}.${field}`);
  }
}

/** Throws if a manifest's output declaration is malformed. Called by the broker at registration. */
export function assertOutputs(outputs: OutputConstraints, at: string): void {
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    throw new InputContractError(
      `${at}: outputs must be an object (use {} for a capability that returns nothing)`,
    );
  }
  for (const field of Object.keys(outputs)) assertDescriptive(outputs[field], `${at}.${field}`);
  assertConstraints(outputs, at);
}

/**
 * Every reason this output does not match what the manifest declared, or an
 * empty array. Same shape as `checkInput` — the list, not a throw — so the
 * caller decides how a violation is reported.
 */
export function checkOutput(outputs: OutputConstraints, output: unknown): string[] {
  // "output", not the engine's default "input". Every violation is read by
  // someone deciding which end of the step to look at.
  return checkInput(outputs, output, "output");
}

/**
 * A content address, as an output field: `sha256:` + 64 hex is 71 characters
 * exactly, so the bounds are the real format rather than a guess.
 *
 * Shared because five capabilities return one and the shape should be stated
 * once — `html.extractTitle` already constrains the same 71/71 on the way IN.
 * The two are the same fact seen from both ends of a `$from` reference.
 */
export const ARTIFACT_ID_OUTPUT = {
  kind: "string",
  required: true,
  minLength: 71,
  maxLength: 71,
} as const satisfies OutputConstraint;

/* ---------------------------------------------------------------------------
 * Gate 8, FIFTH leg — the TRUST of what comes back.
 *
 * `outputs` above says what SHAPE a value has. It says nothing about who
 * authored the bytes, and that is a different question with a different
 * consequence: `browser.navigate` returns `text: string` whether the page was
 * written by the operator's own docs or by an attacker.
 *
 * WHY THIS COULD NOT EXIST BEFORE #69. `llm.chat` has required a `trust` tag
 * on every message since #65, fail-closed at the manifest door. What that
 * cannot do is tell whether the tag is TRUE — a caller writing
 * `trust: "kernel"` over a scraped paragraph satisfied it. provenance.ts says
 * so out loud: "a caller that tags fetched web content as `kernel` is lying,
 * and nothing here detects that". Step data flow changed the shape of the
 * problem, because a value now arrives by reference and the kernel knows, at
 * plan time, exactly which capability produced it. This is the declaration
 * that turns that knowledge into a check (see `validateReferences`).
 *
 * PER FIELD, NOT PER CAPABILITY — the open question in #70, answered the
 * expensive way because the cheap way is a lie. `browser.navigate` returns
 * `ok` (the kernel's own boolean about whether its child process succeeded)
 * and `text` (whatever the page said). A single level for the whole capability
 * would be `untrusted`, making `ok` unusable as a check input, or
 * `capability`, which is false about `text`. `outputs` is already keyed by
 * field, so the honest answer is also the structurally simpler one.
 *
 * TWO LEVELS ARE LEGAL HERE, NOT FOUR. Refusing the other two is the same move
 * this file already makes for `url` and `executable`: a vocabulary that admits
 * a value it cannot mean is a vocabulary that will be used wrongly.
 *
 *   · `kernel` is refused. It means "authored by OPTIMUS itself: system
 *     policy, prompts committed to this repo", and it is the ONLY level
 *     `mayInstruct` returns true for. A return value is computed at run time
 *     out of inputs the kernel did not write. Letting a manifest declare one
 *     `kernel` would let any capability MINT instruction-bearing content by
 *     returning it — the precise escalation this leg exists to prevent.
 *   · `operator` is refused. It means "typed by the human running the
 *     mission". Nothing a capability returns was typed by anyone.
 *
 * So an output field is `capability` (computed by the capability over what it
 * was handed — trusted as a VALUE, never as an instruction) or `untrusted`
 * (the bytes came from outside the boundary).
 * ------------------------------------------------------------------------ */

/** The trust levels an OUTPUT field may declare. See the block above for the two refusals. */
export const OUTPUT_TRUST_LEVELS = ["capability", "untrusted"] as const;

export type OutputTrustLevel = (typeof OUTPUT_TRUST_LEVELS)[number];

/**
 * Per-field trust for a capability's output. REQUIRED and EXHAUSTIVE, checked
 * both directions at registration — see `assertOutputTrust`.
 *
 * There is no default. "Untrusted by default" was the other candidate and it
 * loses for the reason `inputConstraints` is required rather than optional:
 * a field that can be omitted becomes a field nobody revisits, and the
 * omission reads as "safe" long after it stopped being true. Making the
 * manifest author write `untrusted` next to `text` is the entire mechanism.
 */
export type OutputTrust = Readonly<Record<string, OutputTrustLevel>>;

/** Kept honest against provenance.ts rather than duplicating its list. */
const REFUSED_FOR_OUTPUT: readonly Trust[] = TRUST_LEVELS.filter(
  (level): level is Trust => !(OUTPUT_TRUST_LEVELS as readonly string[]).includes(level),
);

const WHY_REFUSED: Record<string, string> = {
  kernel:
    `"kernel" is the only level that may instruct the kernel, and it means bytes OPTIMUS itself ` +
    `authored — committed policy, not a run-time return value. A capability that could declare it ` +
    `would mint instructions by returning them`,
  operator: `"operator" means text the human running the mission typed. A capability returns nothing the operator typed`,
};

/**
 * Throws unless every declared output field has a trust level and every trust
 * entry names a declared output field. Called by the broker at registration.
 *
 * BOTH DIRECTIONS, deliberately. One direction catches the field somebody
 * added to `outputs` and forgot to classify — the dangerous one. The other
 * catches a trust entry left behind for a field that no longer exists, which
 * is harmless at run time and is exactly how a manifest starts describing a
 * capability that no longer matches it. THE SELF-DESCRIPTION RULE: the two
 * halves are one claim, so they are checked against each other, not read.
 */
export function assertOutputTrust(outputs: OutputConstraints, trust: OutputTrust, at: string): void {
  if (!trust || typeof trust !== "object" || Array.isArray(trust)) {
    throw new InputContractError(
      `${at}: outputTrust must be an object (use {} for a capability that returns nothing)`,
    );
  }

  for (const field of Object.keys(outputs)) {
    const level = trust[field];
    if (level === undefined) {
      throw new InputContractError(
        `${at}: output "${field}" has no outputTrust. Every returned field declares whether it was ` +
          `computed here ("capability") or came from outside the boundary ("untrusted"). ` +
          `There is no default — see kernel/outputContract.ts`,
      );
    }
    if (!(OUTPUT_TRUST_LEVELS as readonly string[]).includes(level)) {
      const why = WHY_REFUSED[level as string];
      throw new InputContractError(
        `${at}: output "${field}" declares trust "${level}", which is not legal for an output. ` +
          (why
            ? `${why}. Use "capability" or "untrusted"`
            : `Legal values are ${OUTPUT_TRUST_LEVELS.join(" | ")}`),
      );
    }
  }

  for (const field of Object.keys(trust)) {
    if (!Object.prototype.hasOwnProperty.call(outputs, field)) {
      const declared = Object.keys(outputs);
      throw new InputContractError(
        `${at}: outputTrust names "${field}", which is not a declared output. ` +
          (declared.length ? `It returns: ${declared.join(", ")}` : "It returns nothing"),
      );
    }
  }
}

/**
 * The trust of one output field, fail-closed.
 *
 * Registration already proves every field has an entry, so the fallback is
 * unreachable through the broker. It is here for the one caller that can ask
 * about a field the manifest never declared — and answering "untrusted" to a
 * question about an unknown field is the only safe answer.
 */
export function trustOfOutput(trust: OutputTrust, field: string): OutputTrustLevel {
  return trust[field] ?? "untrusted";
}

/** Names the refused levels for tests and error prose, without a second hardcoded list. */
export const OUTPUT_TRUST_REFUSED = REFUSED_FOR_OUTPUT;
