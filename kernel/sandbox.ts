/**
 * K4 — the isolation boundary. The blast radius, not the door.
 *
 * K2 (permissions.ts) answers WHAT a capability may do: read files, spawn a
 * process, call the network. It has never answered WHERE. A capability
 * granted `fs:write` could write to ~/.ssh/authorized_keys; one granted
 * `net:write` could POST to any host on the internet; and every spawned child
 * process inherited the FULL parent environment — every provider key in .env,
 * plus OPTIMUS_SESSION_SECRET — even though ProcessSpec's own docstring
 * claimed a "minimal safe base". The comment and the code disagreed, and the
 * code was the insecure one.
 *
 * This module is the missing half: a declared, enforced radius for each
 * capability, applied at the single door K2 already owns. CLAUDE.md gate 10:
 * "least-privilege; define blast radius; assign sandbox."
 *
 * Two rules, both deliberately unforgiving:
 *
 *   1. DENY BY DEFAULT. A capability with no declared radius reaches nothing.
 *      A permission is necessary but never sufficient — `fs:write` with no
 *      writeRoots is a capability that cannot write, by construction.
 *   2. NO WILDCARDS. There is no "*" host and no "/" root. A wildcard is how
 *      an allow-list quietly becomes decoration, which is the exact failure
 *      mode Directive #4 exists to prevent.
 *
 * What this does NOT do, stated plainly because an unstated gap is a lie: it
 * confines the OPTIMUS process's own syscalls, not a child process's. A
 * SERVICE-fate capability that spawns a real engine can have that engine's
 * environment stripped and its working directory pinned, but the kernel
 * cannot police what the child then does with a socket. That gap is declared
 * per capability via `unconfinedChildEgress` so it appears in the manifest
 * and is scored honestly, rather than being papered over.
 */

import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export class SandboxViolation extends Error {
  constructor(
    readonly capabilityId: string,
    readonly attempted: string,
    reason: string,
  ) {
    super(`Sandbox violation: ${capabilityId} ${reason} (${attempted})`);
    this.name = "SandboxViolation";
  }
}

/**
 * A capability's declared blast radius. Every field is deny-by-default: an
 * omitted field grants nothing, so an incomplete declaration fails closed.
 */
export interface Isolation {
  /** Absolute directory roots this capability may read beneath. */
  readRoots?: readonly string[];
  /** Absolute directory roots this capability may write beneath. */
  writeRoots?: readonly string[];
  /**
   * Hostnames reachable through the IN-PROCESS network surfaces (netRead,
   * netFetch). Exact matches only — no wildcards, no suffix matching.
   */
  allowedHosts?: readonly string[];
  /**
   * Environment variable names a spawned child may inherit from this process.
   * Everything else is stripped, so a child cannot read secrets it was never
   * granted. A tiny neutral base (PATH, HOME, …) is always present.
   */
  env?: readonly string[];
  /** Working directory a spawned child is pinned to. Must be absolute. */
  cwd?: string;
  /**
   * Set when this capability reaches the network from INSIDE a child process
   * (SERVICE fate). The kernel cannot police a child's egress from here, so
   * this is a declared, UNENFORCED gap — recorded in the manifest so it is
   * visible and scored honestly, never mistaken for a boundary.
   */
  unconfinedChildEgress?: boolean;
}

/** Nothing granted. What a capability gets when it declares no radius. */
export const DENY_ALL: Isolation = {};

/**
 * The only environment a child inherits before its allow-list is applied.
 * Enough to find a binary and a home directory; nothing that identifies a
 * user, authenticates to a service, or points at a secret.
 */
const NEUTRAL_ENV_KEYS = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TEMP", "TMP", "SystemRoot"];

/**
 * Resolve a path to its real location, following symlinks, even when the path
 * does not exist yet — a write target usually doesn't. Walks up to the nearest
 * existing ancestor, resolves THAT, then re-appends the missing segments.
 *
 * Doing this before containment is what defeats the symlink escape: a
 * `sandbox/link -> /etc` would otherwise pass a naive string prefix test.
 */
function realpathNearest(target: string): string {
  let current = resolve(target);
  const missing: string[] = [];

  for (;;) {
    try {
      return join(realpathSync(current), ...[...missing].reverse());
    } catch {
      const parent = dirname(current);
      // Reached the filesystem root and still nothing exists: give up on
      // symlink resolution and use the lexical path. Containment below is
      // still applied, so this degrades to a strict check, never an open one.
      if (parent === current) return resolve(target);
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** True when `candidate` is the root itself or lies beneath it, symlinks resolved. */
export function isWithin(root: string, candidate: string): boolean {
  const realRoot = realpathNearest(root);
  const realCandidate = realpathNearest(candidate);
  if (realCandidate === realRoot) return true;

  const rel = relative(realRoot, realCandidate);
  // A path outside the root produces a relative path that climbs ("../…") or
  // is absolute (different volume on Windows). Either means: not contained.
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Check a filesystem access against the declared roots, or throw. Returns the
 * resolved real path so the caller uses the SAME path that was validated —
 * re-resolving later would reopen a time-of-check/time-of-use gap.
 */
export function requirePathWithin(
  capabilityId: string,
  roots: readonly string[] | undefined,
  target: string,
  operation: "read" | "write",
): string {
  if (!roots || roots.length === 0) {
    throw new SandboxViolation(
      capabilityId,
      target,
      `declares no ${operation === "read" ? "readRoots" : "writeRoots"}, so it may ${operation} nothing`,
    );
  }
  if (!roots.every((root) => isAbsolute(root))) {
    throw new SandboxViolation(capabilityId, target, `has a non-absolute ${operation} root declared`);
  }

  const real = realpathNearest(target);
  if (!roots.some((root) => isWithin(root, target))) {
    throw new SandboxViolation(
      capabilityId,
      target,
      `may only ${operation} beneath ${roots.join(", ")} — resolved to ${real}`,
    );
  }
  return real;
}

/**
 * Check a URL against the declared hosts, or throw. Rejects any scheme other
 * than http/https outright: file:// and data:// would route straight around
 * the filesystem boundary this module just established.
 */
export function requireHostAllowed(
  capabilityId: string,
  allowedHosts: readonly string[] | undefined,
  url: string,
): void {
  if (!allowedHosts || allowedHosts.length === 0) {
    throw new SandboxViolation(capabilityId, url, "declares no allowedHosts, so it may reach nothing");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SandboxViolation(capabilityId, url, "was given a URL that does not parse");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SandboxViolation(capabilityId, url, `may not use the ${parsed.protocol} scheme`);
  }

  const host = parsed.hostname.toLowerCase();
  if (!allowedHosts.some((allowed) => allowed.toLowerCase() === host)) {
    throw new SandboxViolation(
      capabilityId,
      url,
      `may only reach ${allowedHosts.join(", ")} — asked for ${host}`,
    );
  }
}

/**
 * Build the environment a child process is allowed to see: a neutral base,
 * plus explicitly allow-listed names, plus whatever the caller passes
 * explicitly. Everything else in process.env — every provider key, every
 * session secret — is simply absent.
 */
export function childEnv(
  isolation: Isolation,
  explicit: Record<string, string> | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of [...NEUTRAL_ENV_KEYS, ...(isolation.env ?? [])]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  // Explicit values are the capability's own, passed in at call time rather
  // than inherited — they are already inside the boundary.
  return { ...env, ...explicit };
}

/** Check a child's working directory, or throw. */
export function requireCwd(capabilityId: string, isolation: Isolation): string {
  const { cwd } = isolation;
  if (!cwd) {
    throw new SandboxViolation(capabilityId, "<no cwd>", "declares no cwd, so it may not spawn a process");
  }
  if (!isAbsolute(cwd)) {
    throw new SandboxViolation(capabilityId, cwd, "declares a non-absolute cwd");
  }
  return cwd;
}
