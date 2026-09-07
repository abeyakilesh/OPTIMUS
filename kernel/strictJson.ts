/**
 * The one strict-JSON reading in the kernel.
 *
 * WHY IT IS ITS OWN MODULE (#72). `planCompiler.ts` owned this privately, and
 * `models/contract.ts` graded a model's JSON with its own looser reading. That
 * is the exact shape #72 filed against: **a probe lenient where the consumer is
 * strict certifies a model for behaviour the consumer will reject.**
 *
 * Measured on llama3.2:3b, three consecutive compiler runs:
 *
 *   run 0 — correct plan, then `Note that the url is incorrect...`
 *   run 1 — correct plan, then a SECOND object: `{"refuse": "..."}`
 *   run 2 — clean
 *
 * The plans were right. What failed was **stopping**. The old `strict-json`
 * probe asked for a ~40-token answer and never exercised that, so it recorded
 * "this model emits strict JSON" for a size of task it had not tried.
 *
 * TAKING THE FIRST OBJECT IS REFUSED, and run 1 is why: the trailing content
 * was a *refusal*. Extracting the first object would have converted an admitted
 * refusal into a plan — inverting the model's own answer. Leniency here is not
 * a convenience, it is a correctness bug with a friendly face.
 */

/** Strips a markdown fence, so "wrapped it" is distinguishable from "isn't JSON". */
export function unfence(raw: string): string {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(raw.trim());
  return match ? match[1].trim() : raw.trim();
}

/** True when the input was wrapped in a fence — a real failure when one was forbidden. */
export function wasFenced(raw: string): boolean {
  return /^```(?:json)?\s*\n[\s\S]*?\n?```$/.test(raw.trim());
}

/**
 * If `text` starts with a complete JSON object followed by more non-whitespace,
 * return that trailing text. Otherwise `undefined`.
 *
 * A brace-depth scan that respects strings and escapes — not a regex, because
 * the thing being scanned is model output and a backtracking pattern over
 * untrusted text is a denial-of-service surface (same reasoning as
 * `inputContract.ts` refusing to compile patterns).
 */
export function trailingAfterFirstObject(text: string): string | undefined {
  if (text[0] !== "{") return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const rest = text.slice(i + 1).trim();
        return rest.length > 0 ? rest : undefined;
      }
    }
  }
  return undefined;
}

export type StrictParse =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: string };

/**
 * Read model output as exactly one JSON object and nothing else.
 *
 * The failure reasons are deliberately specific. "did not return JSON" is
 * usually FALSE and always unhelpful: measured, the model returns a correct
 * object and then keeps talking, so the useful report names which of those
 * happened.
 */
export function parseStrictObject(raw: string): StrictParse {
  // FENCE POLICY IS THE CALLER'S, and putting it here was a real mistake in
  // the first draft — caught in review on #83.
  //
  // The compiler UNFENCES and accepts: `tests/kernel/plan-compiler.test.ts`
  // has "accepts a fenced plan — the model contract grades fences, this must
  // survive one". The contract PENALISES a fence, because its prompt forbade
  // one and obeying instructions is what that probe measures.
  //
  // Both are right, and the difference is deliberate. Baking rejection in here
  // made the probe stricter than its consumer — the same defect this module
  // exists to prevent, pointed the other way: a backend that fences only long
  // responses would fail qualification for behaviour the compiler tolerates.
  //
  // So this function is fence-NEUTRAL. Callers that care ask `wasFenced`.
  const body = unfence(raw);

  const trailing = trailingAfterFirstObject(body);
  if (trailing !== undefined) {
    return {
      ok: false,
      reason:
        `emitted a valid JSON object and then ${trailing.length} more characters. The trailing ` +
        `text may be a correction or a refusal, so taking the first object would be guessing. ` +
        `Trailing: ${JSON.stringify(trailing.slice(0, 160))}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, reason: `output is not parseable JSON (${body.length} chars)` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "returned JSON that is not an object" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}
