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
