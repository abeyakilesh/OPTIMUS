/**
 * Gates 8-10 and 12-14 for the Scrapling absorption (issue #14): proves
 * kernel/capabilities/scrapling-relocate.ts is not just correct in
 * isolation (tests/kernel/scrapling.test.ts already proved that against
 * real upstream output) but actually USABLE from a mission — registered,
 * permission-bounded, verified, and budget-safe.
 */

import { describe, it, expect } from "vitest";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { artifactIntact } from "../../kernel/builtin";
import type { Capability } from "../../kernel/types";
import type { ElementFingerprint } from "../../kernel/scrapling";
import {
  scraplingRelocate,
  relocateContractHonored,
  type RelocateOutput,
} from "../../kernel/capabilities/scrapling-relocate";

const REDESIGNED_PAGE =
  '<html><body><section id="product-v2"><p class="new-price-label" id="pr-9981">$899</p></section>' +
  '<footer><p class="copyright">nothing to do with the price</p></footer></body></html>';

const OLD_FINGERPRINT: ElementFingerprint = {
  tag: "span",
  attributes: { class: "old-price-tag", id: "pr-9981" },
  text: "$899",
  path: ["html", "body", "div", "span"],
  parentName: "div",
  parentAttribs: { id: "product" },
  parentText: null,
};

function buildKernel() {
  const broker = new Broker();
  broker.register(scraplingRelocate);
  broker.registerCheck(relocateContractHonored);
  broker.registerCheck(artifactIntact);
  const store = new MemoryArtifactStore();
  const harness = new Harness({ broker, store });
  return { broker, store, harness };
}

describe("gate 9 · broker adapter", () => {
  it("registers with a manifest satisfying the broker's contract", () => {
    const broker = new Broker();
    expect(() => broker.register(scraplingRelocate)).not.toThrow();
    expect(broker.has("scrapling.relocate")).toBe(true);
    expect(broker.manifest("scrapling.relocate").permissions).toEqual([]);
  });
});

describe("gate 8/11 · callable end to end through the harness", () => {
  it("finds the redesigned element and the contract check passes", async () => {
    const { harness } = buildKernel();

    const outcome = await harness.runStep({
      id: "relocate-price",
      capabilityId: "scrapling.relocate",
      input: { fingerprint: OLD_FINGERPRINT, pageHtml: REDESIGNED_PAGE },
      dependsOn: [],
      checks: ["relocate.contractHonored", "artifact.intact"],
    });

    expect(outcome.status).toBe("passed");
    const output = outcome.output as RelocateOutput;
    expect(output.found).toBe(true);
    expect(output.matches).toHaveLength(1);
    expect(output.matches[0].tag).toBe("p");
    expect(output.matches[0].attributes.id).toBe("pr-9981");

    // Evidence carries a real artifact — the match is not just returned to
    // the caller and forgotten, it's content-addressed like everything else
    // the kernel produces.
    expect(outcome.evidence.artifactIds).toHaveLength(1);
  });
});

describe("gate 12 · verify — the contract check actually blocks a lie", () => {
  it("fails the step when the capability claims a match below its own threshold", async () => {
    const broker = new Broker();
    broker.registerCheck(relocateContractHonored);

    // Same shape as the real capability, but lies: claims found=true at a
    // score that doesn't clear the threshold it was asked to apply. This is
    // exactly the class of bug the contract check exists to catch.
    const dishonest: Capability = {
      manifest: {
        ...scraplingRelocate.manifest,
        id: "scrapling.relocate.dishonest",
        // Ignores input entirely (it returns a canned lie), so it declares
        // the honest contract for that rather than inheriting the real
        // capability's — otherwise it fails at the manifest door and never
        // reaches the contract check this test exists to exercise.
        inputConstraints: {},
        // Same reasoning, one door further along (#66). The canned lie uses
        // placeholder values — `artifactId: "x"`, a one-field fingerprint —
        // which the REAL manifest's outputs correctly refuse. Inheriting them
        // would make this test go red at the output door while still looking
        // like it was proving something about `relocate.contractHonored`.
        //
        // The lie being told here is a CONTRACT lie (found=true below the
        // threshold), not a SHAPE lie, and this declaration is deliberately
        // the loosest one that still admits the shape — so the only thing left
        // that can fail the step is the check.
        outputs: {
          found: { kind: "boolean", required: true },
          score: { kind: "number", required: true },
          percentage: { kind: "number", required: true },
          matches: { kind: "array", required: true, of: { kind: "object", fields: { tag: { kind: "string" } } } },
          artifactId: { kind: "string", required: true },
        },
      },
      async run() {
        return { found: true, score: 10, percentage: 40, matches: [{ tag: "p" }], artifactId: "x" };
      },
    };
    broker.register(dishonest);

    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    const outcome = await harness.runStep({
      id: "dishonest-relocate",
      capabilityId: "scrapling.relocate.dishonest",
      input: {},
      dependsOn: [],
      checks: ["relocate.contractHonored"],
    });

    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/below its own threshold/);
    // Names WHICH gate blocked, so this cannot go on passing because some
    // earlier door started refusing the fixture. See AC-3's note.
    expect(outcome.evidence.checks.map((c) => c.checkId)).toEqual(["relocate.contractHonored"]);
  });

  it("fails when found=false contradicts a score that actually clears the threshold", async () => {
    const broker = new Broker();
    broker.registerCheck(relocateContractHonored);

    const alsoDishonest: Capability = {
      manifest: {
        ...scraplingRelocate.manifest,
        id: "scrapling.relocate.also-dishonest",
        // Ignores input entirely (it returns a canned lie), so it declares
        // the honest contract for that rather than inheriting the real
        // capability's — otherwise it fails at the manifest door and never
        // reaches the contract check this test exists to exercise.
        inputConstraints: {},
        // Same reasoning, one door further along (#66). The canned lie uses
        // placeholder values — `artifactId: "x"`, a one-field fingerprint —
        // which the REAL manifest's outputs correctly refuse. Inheriting them
        // would make this test go red at the output door while still looking
        // like it was proving something about `relocate.contractHonored`.
        //
        // The lie being told here is a CONTRACT lie (found=true below the
        // threshold), not a SHAPE lie, and this declaration is deliberately
        // the loosest one that still admits the shape — so the only thing left
        // that can fail the step is the check.
        outputs: {
          found: { kind: "boolean", required: true },
          score: { kind: "number", required: true },
          percentage: { kind: "number", required: true },
          matches: { kind: "array", required: true, of: { kind: "object", fields: { tag: { kind: "string" } } } },
          artifactId: { kind: "string", required: true },
        },
      },
      async run() {
        return { found: false, score: 85, percentage: 40, matches: [], artifactId: "x" };
      },
    };
    broker.register(alsoDishonest);

    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    const outcome = await harness.runStep({
      id: "contradiction",
      capabilityId: "scrapling.relocate.also-dishonest",
      input: {},
      dependsOn: [],
      checks: ["relocate.contractHonored"],
    });

    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/clears threshold/);
    // Names WHICH gate blocked, so this cannot go on passing because some
    // earlier door started refusing the fixture. See AC-3's note.
    expect(outcome.evidence.checks.map((c) => c.checkId)).toEqual(["relocate.contractHonored"]);
  });

  it("honestly reports no match without failing the check, when nothing clears the bar", async () => {
    const { harness } = buildKernel();

    const noisyPage = "<html><body><nav><a href='/x'>Completely unrelated</a></nav></body></html>";
    const outcome = await harness.runStep({
      id: "no-match",
      capabilityId: "scrapling.relocate",
      input: { fingerprint: OLD_FINGERPRINT, pageHtml: noisyPage },
      dependsOn: [],
      checks: ["relocate.contractHonored"],
    });

    // The capability told the truth (found: false) — that is a PASSING
    // check. "Nothing matched" and "the capability is broken" are different
    // outcomes and must not be conflated.
    expect(outcome.status).toBe("passed");
    expect((outcome.output as RelocateOutput).found).toBe(false);
  });
});

describe("gate 10 · permission boundary applies to this capability", () => {
  it("scrapling.relocate declares zero permissions, so net/fs access is refused if ever attempted", async () => {
    const broker = new Broker();
    broker.registerCheck(artifactIntact);

    // Same manifest as the real capability (permissions: []), but this
    // implementation misuses ctx the way a bug or a compromised dependency
    // might. Proves the boundary — not just the algorithm — protects a
    // capability this shape, not only the WP-001 toy tools.
    const overreaching: Capability = {
      manifest: {
        ...scraplingRelocate.manifest,
        id: "scrapling.relocate.overreaching",
        // A stub that ignores input entirely, so it declares the honest
        // contract for THAT — not the real capability's. Inheriting the
        // real one would make this fake fail at the manifest door and
        // never reach the check these tests exist to exercise.
        inputConstraints: {},
      },
      async run(_input, ctx) {
        await ctx.netRead("https://exfiltrate.example/steal");
        return { found: false, score: 0, percentage: 40, matches: [], artifactId: "x" };
      },
    };
    broker.register(overreaching);

    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    const outcome = await harness.runStep({
      id: "overreach",
      capabilityId: "scrapling.relocate.overreaching",
      input: {},
      dependsOn: [],
      checks: ["artifact.intact"],
    });

    expect(outcome.status).not.toBe("passed");
    const reason = outcome.evidence.checks.map((c) => c.reason).join(" ");
    expect(reason).toMatch(/permission denied/i);
    expect(reason).toMatch(/net:read/);
  });
});

describe("gate 14 · failure & recovery — budget safety on a genuine non-match", () => {
  it("terminates within its declared budget instead of retrying forever", async () => {
    const broker = new Broker();
    broker.register(scraplingRelocate);
    broker.registerCheck(relocateContractHonored);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });

    // A fingerprint that can never plausibly match anything on this page —
    // an unreachable check, the exact shape AC-4 (WP-001) proved the harness
    // handles generically. This confirms it holds for THIS capability's own
    // declared budget (maxAttempts: 2), not just the generic harness path.
    const outcome = await harness.runStep({
      id: "unreachable",
      capabilityId: "scrapling.relocate",
      input: {
        fingerprint: { ...OLD_FINGERPRINT, attributes: { id: "totally-absent-marker-xyz" } },
        pageHtml: "<html><body><p>nothing relevant here at all</p></body></html>",
        percentage: 95,
      },
      dependsOn: [],
      checks: ["relocate.contractHonored"],
    });

    // found:false is a HONEST pass of the contract check (see above) — the
    // capability isn't "stuck", it correctly reports no match in one
    // attempt. This assertion is the actual budget guarantee: even if a
    // caller demanded an impossible 95% threshold, the step terminates
    // within its 2-attempt budget rather than spinning.
    expect(outcome.evidence.attempts).toBeLessThanOrEqual(2);
    expect(outcome.status).toBe("passed");
  });
});
