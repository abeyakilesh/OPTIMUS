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
