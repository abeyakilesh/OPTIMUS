/**
 * K1 — the broker. One registry, one manifest schema.
 *
 * CLAUDE.md gate 9: skill / MCP-tool / n8n-node / sim-tool all register the
 * same way. Whatever a capability's origin, the kernel sees this shape and
 * nothing else, which is what stops the "62 repos, 62 integration styles"
 * problem before it starts.
 */

import type { Budget, Capability, CapabilityManifest, Check } from "./types";
import type { Isolation } from "./sandbox";
import { assertConstraints, checkInput } from "./inputContract";
import { assertOutputs, checkOutput } from "./outputContract";

export class BrokerError extends Error {}

function assertValidBudget(budget: Budget, id: string): void {
  // A capability with an unusable budget is a slot machine with extra steps.
  // Gate 8 of the onboarding pipeline: no budget, no registration.
  if (!Number.isFinite(budget.maxAttempts) || budget.maxAttempts < 1) {
    throw new BrokerError(`${id}: maxAttempts must be >= 1`);
  }
  if (!Number.isFinite(budget.maxWallTimeMs) || budget.maxWallTimeMs <= 0) {
    throw new BrokerError(`${id}: maxWallTimeMs must be > 0`);
  }
  if (!Number.isFinite(budget.maxCost) || budget.maxCost < 0) {
    throw new BrokerError(`${id}: maxCost must be >= 0`);
  }
}

/**
 * Gate 10, enforced at registration: a capability may not declare a permission
 * whose blast radius is unbounded. Permissions say WHAT, isolation says WHERE,
 * and a manifest that says what without where is a hole with paperwork.
 *
 * Refusing here rather than at call time is deliberate — a capability that can
 * never legally act should fail on the way IN, not halfway through a mission.
 */
function assertBoundedRadius(manifest: CapabilityManifest): void {
  const iso: Isolation = manifest.isolation ?? {};
  const id = manifest.id;
  const has = (p: string) => manifest.permissions.includes(p as never);

  if (has("fs:read") && !iso.readRoots?.length) {
    throw new BrokerError(`${id}: declares fs:read but no isolation.readRoots — unbounded radius`);
  }
  if (has("fs:write") && !iso.writeRoots?.length) {
    throw new BrokerError(`${id}: declares fs:write but no isolation.writeRoots — unbounded radius`);
  }
  // unconfinedChildEgress excuses a net permission ONLY for a capability that
  // also spawns a process — that is the one case where the traffic genuinely
  // leaves from somewhere the kernel cannot see. A capability calling netRead
  // or netFetch in-process IS policeable, so it gets no such excuse: letting
  // the flag stand in for a real allow-list there would have been a hole
  // wearing an honest label. (Caught by the acceptance suite, not by review.)
  const childEgressExcused = has("proc:spawn") && iso.unconfinedChildEgress === true;
  if ((has("net:read") || has("net:write")) && !iso.allowedHosts?.length && !childEgressExcused) {
    throw new BrokerError(
      `${id}: declares a net permission but no isolation.allowedHosts. In-process network calls ` +
        `must name their hosts. Only a capability that ALSO declares proc:spawn may substitute ` +
        `unconfinedChildEgress, and only because the kernel cannot police a child's sockets`,
    );
  }
  if (has("proc:spawn") && !iso.cwd) {
    throw new BrokerError(`${id}: declares proc:spawn but no isolation.cwd — the child would inherit ours`);
  }
}

/**
 * Gate 8, third leg, enforced at registration: a manifest's inputConstraints
 * must themselves be well-formed. A malformed constraint (an empty enum, an
 * array with no element type, a url with neither allowedHosts nor an explicit
 * anyHost) would silently accept everything it was meant to refuse, which is
 * strictly worse than having no constraint — it reads as protection.
 */
function assertInputContract(manifest: CapabilityManifest): void {
  if (manifest.inputConstraints === undefined) {
    throw new BrokerError(
      `${manifest.id}: manifest declares no inputConstraints. A capability that takes no input ` +
        `declares {} — meaning "the input must be empty". There is no value meaning "anything goes"`,
    );
  }
  assertConstraints(manifest.inputConstraints, manifest.id);
}

/**
 * Gate 8, fourth leg, enforced at registration: a manifest must SAY what it
 * returns, and the saying must be well-formed.
 *
 * Absent is refused rather than defaulted, because the only available default
 * would be "anything", and a capability whose output is unconstrained cannot
 * be referenced by a later step with any confidence — the reference would
 * validate against a promise nobody made.
 */
function assertOutputContract(manifest: CapabilityManifest): void {
  if (manifest.outputs === undefined) {
    throw new BrokerError(
      `${manifest.id}: manifest declares no outputs. A capability that returns nothing declares {} — ` +
        `meaning "the output must be empty". There is no value meaning "anything goes"`,
    );
  }
  assertOutputs(manifest.outputs, manifest.id);
}

export class Broker {
  private readonly capabilities = new Map<string, Capability>();
  private readonly checks = new Map<string, Check>();

  register(capability: Capability): void {
    const { manifest } = capability;
    if (!manifest.id) throw new BrokerError("Capability manifest needs an id");
    if (!manifest.version) throw new BrokerError(`${manifest.id}: manifest needs a version`);
    if (this.capabilities.has(manifest.id)) {
      throw new BrokerError(`Capability already registered: ${manifest.id}`);
    }
    assertValidBudget(manifest.defaultBudget, manifest.id);
    assertBoundedRadius(manifest);
    assertInputContract(manifest);
    assertOutputContract(manifest);
    this.capabilities.set(manifest.id, capability);
  }

  registerCheck(check: Check): void {
    if (!check.id) throw new BrokerError("Check needs an id");
    if (this.checks.has(check.id)) {
      throw new BrokerError(`Check already registered: ${check.id}`);
    }
    this.checks.set(check.id, check);
  }

  capability(id: string): Capability {
    const found = this.capabilities.get(id);
    if (!found) throw new BrokerError(`No such capability: ${id}`);
    return found;
  }

  check(id: string): Check {
    const found = this.checks.get(id);
    if (!found) throw new BrokerError(`No such check: ${id}`);
    return found;
  }

  /**
   * Refuse step input that a capability's manifest does not accept — BEFORE
   * `run()` is ever called, so the capability never sees a value it did not
   * declare, and never gets the chance to build a request (or a command line)
   * around one.
   *
   * This lives on the broker rather than in the capability because a
   * capability checking its own input is the capability trusting itself. The
   * broker is the one place every invocation already passes through, which is
   * the same reason the permission boundary lives at a single door.
   */
  validateInput(capabilityId: string, input: unknown): void {
    const violations = checkInput(this.manifest(capabilityId).inputConstraints, input);
    if (violations.length > 0) {
      throw new BrokerError(`${capabilityId}: input refused — ${violations.join("; ")}`);
    }
  }

  /**
   * The mirror of `validateInput`, run on the way OUT — after `run()` returns
   * and BEFORE any check sees the value.
   *
   * Ordering matters and is not arbitrary. A check asks the mission's
   * question ("is this title non-empty"); this asks the contract's ("is this
   * the shape the manifest promised"). Running it first means a capability
   * that has drifted from its own manifest fails as a contract violation with
   * the field named, instead of as whatever downstream confusion the wrong
   * shape happens to produce.
   *
   * Refusing here rather than trusting the declaration is what stops `outputs`
   * from being decoration. `$from` resolution in the next PR reads a field
   * this promised exists; if nothing ever compared promise to value, the
   * reference would resolve to `undefined` and the mission would carry on.
   */
  validateOutput(capabilityId: string, output: unknown): void {
    const violations = checkOutput(this.manifest(capabilityId).outputs, output);
    if (violations.length > 0) {
      throw new BrokerError(
        `${capabilityId}: output does not match its declared outputs — ${violations.join("; ")}`,
      );
    }
  }

  manifest(id: string): CapabilityManifest {
    return this.capability(id).manifest;
  }

  /** Everything registered — used by the surface to render what's available. */
  manifests(): CapabilityManifest[] {
    return [...this.capabilities.values()].map((c) => c.manifest);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }
}
