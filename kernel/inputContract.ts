/**
 * Gate 8, third leg — the input contract.
 *
 * A manifest already says what a capability may DO (`permissions`) and WHERE
 * it may do it (`isolation`). Neither says WHAT IT MAY BE ASKED TO DO, and
 * that turns out to be a separate layer with its own holes:
 *
 *   K4 refuses the outbound connection; it does not refuse a capability
 *   constructing a request to a host it was handed. Those are different
 *   layers.
 *
 * Three real instances found in the three absorbed capabilities, all the same
 * shape — a value arriving as step input that no existing boundary examines:
 *
 *   1. `llm.chat.baseUrl` — isolation.allowedHosts stops the socket opening
 *      to a remote host. It does not stop this capability being HANDED a
 *      remote baseUrl and building a request around it first, including one
 *      carrying the caller-supplied `apiKey` in an Authorization header. The
 *      request is assembled with the credential in it, then refused.
 *
 *   2. `browser.navigate.url` — handed straight to a real Chromium. A
 *      `file://` URL is a local file read whose contents come back in
 *      `output.text`. K4's readRoots do not apply: the read happens inside a
 *      child process, which is exactly the gap `unconfinedChildEgress`
 *      already admits to for sockets.
 *
 *   3. `browser.navigate.pythonExecutable` — an arbitrary string passed to
 *      `spawn()` as the command. `proc:spawn` gates WHETHER a child may run;
 *      `isolation.cwd` gates WHERE. Nothing gated WHICH BINARY.
 *
 * None of those is fixable by tightening permissions or isolation, because
 * none of them is a permission or an isolation question. Hence this file.
 *
 * Deliberately NOT a JSON Schema implementation. It is a small closed set of
 * constraint kinds chosen so that every check is linear in the size of the
 * input and none of them compiles a pattern — the manifests are trusted, but
 * the input is not, and a regex engine between the two is a denial-of-service
 * surface we have no reason to open.
 */

/** Cap on how deep an input may nest, so a hostile payload cannot blow the stack. */
const MAX_DEPTH = 12;
/** Cap on violations reported, so an error message stays readable. */
const MAX_VIOLATIONS = 10;

export interface ConstraintBase {
  /** Omitted means optional: absent is fine, present must still satisfy the constraint. */
  required?: boolean;
  /** Whether an explicit `null` is accepted in addition to the declared kind. */
  nullable?: boolean;
}

export interface StringConstraint extends ConstraintBase {
  kind: "string";
  /** Closed set of permitted values. Exact match, no wildcards. */
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
}

/**
 * A URL, parsed rather than pattern-matched. Deliberately mirrors
 * `Isolation.allowedHosts` — the SAME host list appears at two layers, and
 * that duplication is the point: this one refuses the value at the door,
 * K4's refuses the socket. A reader comparing them can see both are enforced.
 */
export interface UrlConstraint extends ConstraintBase {
  kind: "url";
  /** e.g. ["http", "https"]. Required — an unconstrained scheme is how `file://` gets in. */
  allowedSchemes: readonly string[];
  /** Exact hostnames, no wildcards (same rule as isolation.allowedHosts). */
  allowedHosts?: readonly string[];
  /**
   * Deliberate, greppable declaration that this capability legitimately takes
   * any host (browser.navigate does — navigating the web is the job). Required
   * when `allowedHosts` is omitted, exactly like `unconfinedChildEgress`:
   * an admitted gap the broker can see beats a silent one.
   */
  anyHost?: true;
}

/**
 * A path to an executable. Its own kind rather than a string with an enum,
 * because "which binary may this capability be told to run" deserves to be
 * greppable across every manifest in the repo.
 */
export interface ExecutableConstraint extends ConstraintBase {
  kind: "executable";
  /** Exact permitted values — a bare name resolved on PATH, or an absolute path. */
  allowed: readonly string[];
}

export interface NumberConstraint extends ConstraintBase {
  kind: "number";
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface BooleanConstraint extends ConstraintBase {
  kind: "boolean";
}

export interface ArrayConstraint extends ConstraintBase {
  kind: "array";
  /** Required: an array whose elements are unconstrained is a hole with a length limit. */
  of: InputConstraint;
  minLength?: number;
  maxLength?: number;
}

/** An object with a KNOWN set of fields. Undeclared fields are refused. */
export interface ObjectConstraint extends ConstraintBase {
  kind: "object";
  fields: InputConstraints;
}

/** An open map — unknown keys, but every VALUE still constrained. */
export interface RecordConstraint extends ConstraintBase {
  kind: "record";
  values: InputConstraint;
  maxEntries?: number;
}

export type InputConstraint =
  | StringConstraint
  | UrlConstraint
  | ExecutableConstraint
  | NumberConstraint
  | BooleanConstraint
  | ArrayConstraint
  | ObjectConstraint
  | RecordConstraint;

/**
 * The fields of a capability's input. Input is always an object — every
 * capability in the kernel takes one, and requiring it means a manifest can
 * name its parameters.
 *
 * An empty object is meaningful and correct for a capability that takes no
 * input: it says "the input must be empty", not "anything goes".
 */
export type InputConstraints = Readonly<Record<string, InputConstraint>>;

export class InputContractError extends Error {}

/* ── registration time: are the CONSTRAINTS themselves well-formed? ──────── */

function own(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function assertBounds(c: { minLength?: number; maxLength?: number }, at: string): void {
  const { minLength, maxLength } = c;
  if (minLength !== undefined && (!Number.isFinite(minLength) || minLength < 0)) {
    throw new InputContractError(`${at}: minLength must be >= 0`);
  }
  if (maxLength !== undefined && (!Number.isFinite(maxLength) || maxLength < 0)) {
    throw new InputContractError(`${at}: maxLength must be >= 0`);
  }
  if (minLength !== undefined && maxLength !== undefined && minLength > maxLength) {
    throw new InputContractError(`${at}: minLength ${minLength} > maxLength ${maxLength}`);
  }
}

function assertConstraint(c: InputConstraint, at: string, depth: number): void {
  if (depth > MAX_DEPTH) throw new InputContractError(`${at}: constraint nests deeper than ${MAX_DEPTH}`);
  if (!c || typeof c !== "object") throw new InputContractError(`${at}: constraint must be an object`);

  switch (c.kind) {
    case "string":
      if (c.enum !== undefined && (!Array.isArray(c.enum) || c.enum.length === 0)) {
        throw new InputContractError(`${at}: enum must be a non-empty array`);
      }
      assertBounds(c, at);
      return;

    case "url":
      if (!Array.isArray(c.allowedSchemes) || c.allowedSchemes.length === 0) {
        throw new InputContractError(`${at}: url needs a non-empty allowedSchemes`);
      }
      // The same fail-closed shape as gate 10's blast radius: you may take
      // any host, but you must SAY so.
      if (!c.allowedHosts?.length && c.anyHost !== true) {
        throw new InputContractError(
          `${at}: url declares no allowedHosts. A capability that legitimately accepts any host ` +
            `must say so with anyHost: true — an unconstrained host is not something a manifest ` +
            `gets to leave implied`,
        );
      }
      if (c.allowedHosts?.length && c.anyHost === true) {
        throw new InputContractError(`${at}: url declares both allowedHosts and anyHost — pick one`);
      }
      if (c.allowedHosts?.some((h) => h.includes("*"))) {
        throw new InputContractError(`${at}: wildcard hosts are not permitted (same rule as isolation.allowedHosts)`);
      }
      return;

    case "executable":
      if (!Array.isArray(c.allowed) || c.allowed.length === 0) {
        throw new InputContractError(`${at}: executable needs a non-empty allowed list`);
      }
      return;

    case "number":
      if (c.min !== undefined && !Number.isFinite(c.min)) throw new InputContractError(`${at}: min must be finite`);
      if (c.max !== undefined && !Number.isFinite(c.max)) throw new InputContractError(`${at}: max must be finite`);
      if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
        throw new InputContractError(`${at}: min ${c.min} > max ${c.max}`);
      }
      return;

    case "boolean":
      return;

    case "array":
      if (!c.of) throw new InputContractError(`${at}: array needs "of" — unconstrained elements are a hole`);
      assertBounds(c, at);
      assertConstraint(c.of, `${at}[]`, depth + 1);
      return;

    case "object":
      if (!c.fields || typeof c.fields !== "object") {
        throw new InputContractError(`${at}: object needs "fields" (use kind record for an open map)`);
      }
      assertConstraints(c.fields, at, depth + 1);
      return;

    case "record":
      if (!c.values) throw new InputContractError(`${at}: record needs "values"`);
      if (c.maxEntries !== undefined && (!Number.isFinite(c.maxEntries) || c.maxEntries < 0)) {
        throw new InputContractError(`${at}: maxEntries must be >= 0`);
      }
      assertConstraint(c.values, `${at}{}`, depth + 1);
      return;

    default:
      throw new InputContractError(`${at}: unknown constraint kind ${JSON.stringify((c as { kind: string }).kind)}`);
  }
}

/** Throws if a manifest's constraints are malformed. Called by the broker at registration. */
export function assertConstraints(constraints: InputConstraints, at: string, depth = 0): void {
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) {
    throw new InputContractError(`${at}: inputConstraints must be an object (use {} for a capability taking no input)`);
  }
  for (const field of Object.keys(constraints)) {
    assertConstraint(constraints[field], `${at}.${field}`, depth + 1);
  }
}

/* ── run time: does this INPUT satisfy the constraints? ──────────────────── */

function checkValue(c: InputConstraint, value: unknown, at: string, depth: number, out: string[]): void {
  if (out.length >= MAX_VIOLATIONS) return;
  if (depth > MAX_DEPTH) {
    out.push(`${at}: nests deeper than ${MAX_DEPTH}`);
    return;
  }
  if (value === null) {
    if (!c.nullable) out.push(`${at}: null is not permitted`);
    return;
  }

  switch (c.kind) {
    case "string": {
      if (typeof value !== "string") return void out.push(`${at}: expected a string, got ${typeName(value)}`);
      if (c.enum && !c.enum.includes(value)) {
        out.push(`${at}: ${JSON.stringify(value)} is not one of ${JSON.stringify(c.enum)}`);
      }
      if (c.minLength !== undefined && value.length < c.minLength) {
        out.push(`${at}: shorter than minLength ${c.minLength}`);
      }
      if (c.maxLength !== undefined && value.length > c.maxLength) {
        out.push(`${at}: longer than maxLength ${c.maxLength} (${value.length})`);
      }
      return;
    }

    case "url": {
      if (typeof value !== "string") return void out.push(`${at}: expected a URL string, got ${typeName(value)}`);
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        out.push(`${at}: ${JSON.stringify(value.slice(0, 120))} is not a parseable URL`);
        return;
      }
      const scheme = parsed.protocol.replace(/:$/, "");
      if (!c.allowedSchemes.includes(scheme)) {
        out.push(`${at}: scheme ${JSON.stringify(scheme)} is not one of ${JSON.stringify(c.allowedSchemes)}`);
      }
      if (c.allowedHosts && !c.allowedHosts.includes(parsed.hostname)) {
        out.push(
          `${at}: host ${JSON.stringify(parsed.hostname)} is not one of ${JSON.stringify(c.allowedHosts)}`,
        );
      }
      return;
    }

    case "executable": {
      if (typeof value !== "string") return void out.push(`${at}: expected a string, got ${typeName(value)}`);
      if (!c.allowed.includes(value)) {
        out.push(`${at}: ${JSON.stringify(value)} is not a permitted executable ${JSON.stringify(c.allowed)}`);
      }
      return;
    }

    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return void out.push(`${at}: expected a finite number, got ${typeName(value)}`);
      }
      if (c.integer && !Number.isInteger(value)) out.push(`${at}: expected an integer, got ${value}`);
      if (c.min !== undefined && value < c.min) out.push(`${at}: ${value} is below min ${c.min}`);
      if (c.max !== undefined && value > c.max) out.push(`${at}: ${value} is above max ${c.max}`);
      return;
    }

    case "boolean": {
      if (typeof value !== "boolean") out.push(`${at}: expected a boolean, got ${typeName(value)}`);
      return;
    }

    case "array": {
      if (!Array.isArray(value)) return void out.push(`${at}: expected an array, got ${typeName(value)}`);
      if (c.minLength !== undefined && value.length < c.minLength) {
        out.push(`${at}: has ${value.length} items, minLength is ${c.minLength}`);
      }
      if (c.maxLength !== undefined && value.length > c.maxLength) {
        // Return early: reporting 10,000 element violations helps nobody.
        return void out.push(`${at}: has ${value.length} items, maxLength is ${c.maxLength}`);
      }
      for (let i = 0; i < value.length && out.length < MAX_VIOLATIONS; i += 1) {
        checkValue(c.of, value[i], `${at}[${i}]`, depth + 1, out);
      }
      return;
    }

    case "object": {
      if (!isPlainObject(value)) return void out.push(`${at}: expected an object, got ${typeName(value)}`);
      checkFields(c.fields, value, at, depth + 1, out);
      return;
    }

    case "record": {
      if (!isPlainObject(value)) return void out.push(`${at}: expected an object, got ${typeName(value)}`);
      const keys = Object.keys(value);
      if (c.maxEntries !== undefined && keys.length > c.maxEntries) {
        return void out.push(`${at}: has ${keys.length} entries, maxEntries is ${c.maxEntries}`);
      }
      for (const key of keys) {
        if (out.length >= MAX_VIOLATIONS) return;
        checkValue(c.values, (value as Record<string, unknown>)[key], `${at}.${key}`, depth + 1, out);
      }
      return;
    }
  }
}

function checkFields(
  constraints: InputConstraints,
  value: Record<string, unknown>,
  at: string,
  depth: number,
  out: string[],
): void {
  // Closed set. An undeclared field is refused rather than ignored: silently
  // dropping it is how a new parameter gets added to a capability and never
  // acquires a constraint.
  for (const key of Object.keys(value)) {
    if (out.length >= MAX_VIOLATIONS) return;
    if (!own(constraints, key)) {
      out.push(`${at}.${key}: undeclared field — this capability's manifest does not accept it`);
    }
  }
  for (const field of Object.keys(constraints)) {
    if (out.length >= MAX_VIOLATIONS) return;
    const c = constraints[field];
    const present = own(value, field) && value[field] !== undefined;
    if (!present) {
      if (c.required) out.push(`${at}.${field}: required field is missing`);
      continue;
    }
    checkValue(c, value[field], `${at}.${field}`, depth, out);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Returns every reason this input is unacceptable, or an empty array if it is
 * fine. Returning the list rather than throwing keeps the caller in charge of
 * how a refusal is reported — the harness turns it into a failed observation,
 * the same shape a permission denial already arrives in.
 */
export function checkInput(constraints: InputConstraints, input: unknown): string[] {
  const out: string[] = [];
  if (input === undefined || input === null) {
    // `{}` is the correct input for a capability that takes none.
    if (Object.keys(constraints).length === 0) return out;
    out.push("input: expected an object, got " + typeName(input ?? null));
    return out;
  }
  if (!isPlainObject(input)) {
    out.push(`input: expected an object, got ${typeName(input)}`);
    return out;
  }
  checkFields(constraints, input, "input", 1, out);
  return out;
}
