import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  qualificationOf,
  isQualified,
  qualifiedModelIds,
  CONTRACT_VERSION,
  QUALIFICATION,
  type QualificationRecord,
} from "../../kernel/models/qualified";
import { PROBES } from "../../kernel/models/contract";

/**
 * #49 — the model contract as an actual gate. These test REFUSAL, because a
 * gate is only worth having if it can say no.
 */

function recordWith(models: QualificationRecord["models"]): QualificationRecord {
  return { contractVersion: CONTRACT_VERSION, maxAgeDays: 30, models };
}

const passing = (id: string, qualifiedAt: string) => ({
  id,
  baseUrl: "http://127.0.0.1:20128",
  qualifiedAt,
  probes: PROBES.map((p) => ({ id: p.id, passed: true, reason: "ok" })),
});

describe("an unqualified model is refused", () => {
  it("refuses a model that is simply not in the record", () => {
    const v = qualificationOf("ollama/never-tested", new Date(), recordWith([]));
    expect(v.qualified).toBe(false);
    if (!v.qualified) {
      expect(v.reason).toMatch(/has not passed the model contract/);
      // The refusal has to say how to fix it, or it is a wall, not a gate.
      expect(v.reason).toMatch(/scripts\/model-contract\.ts/);
    }
  });

  it("refuses a model whose record says a probe FAILED", () => {
    // Guards the --record path: an entry must not be able to claim
    // qualification while carrying a failure, which is a green check on
    // nothing (Directive #4).
    const entry = passing("ollama/bad", new Date().toISOString());
    entry.probes[2] = { id: "refuses-to-fabricate", passed: false, reason: "fabricated a figure" };
    const v = qualificationOf("ollama/bad", new Date(), recordWith([entry]));
    expect(v.qualified).toBe(false);
    if (!v.qualified) expect(v.reason).toMatch(/failed refuses-to-fabricate/);
  });

  it("refuses a qualification that has gone stale", () => {
    // A model id is not a model. The same id can be requantised or replaced
    // upstream, so a pass from 40 days ago is not evidence about today.
    const old = new Date("2026-01-01T00:00:00Z").toISOString();
    const v = qualificationOf("ollama/stale", new Date("2026-03-01T00:00:00Z"), recordWith([passing("ollama/stale", old)]));
    expect(v.qualified).toBe(false);
    if (!v.qualified) expect(v.reason).toMatch(/past the 30-day limit/);
  });

  it("refuses EVERY model when the record was written against an older contract", () => {
    const rec = { ...recordWith([passing("ollama/x", new Date().toISOString())]), contractVersion: 0 };
    const v = qualificationOf("ollama/x", new Date(), rec);
    expect(v.qualified).toBe(false);
    if (!v.qualified) expect(v.reason).toMatch(/re-qualified/);
  });

  it("accepts a fresh, fully-passing entry", () => {
    const v = qualificationOf("ollama/good", new Date(), recordWith([passing("ollama/good", new Date().toISOString())]));
    expect(v.qualified).toBe(true);
  });
});

describe("the committed record is honest about what has been measured", () => {
  // #72 bumped the contract to v2 and the record was EMPTIED rather than
  // carried forward. The previous entries certified llama3.2 and qwen2.5 on a
  // ~40-token answer, which is not the task the compiler asks of them.
  //
  // They are NOT known to fail v2 — they are UNMEASURED against it, and the
  // difference matters: the honest state is "nothing is qualified yet", not
  // "these models were rejected". Re-running the probes needs a live
  // OmniRoute, which CI does not have.

  it("is written against the CURRENT contract version", () => {
    expect(QUALIFICATION.contractVersion).toBe(CONTRACT_VERSION);
  });

  it("qualifies nobody until the v2 probes are actually run", () => {
    // This is the deliberate, visible consequence. An empty record means the
    // model layer is UNAVAILABLE and the route returns 503 — which is the
    // correct answer to "has any model passed this contract?" today.
    expect(qualifiedModelIds()).toEqual([]);
    expect(isQualified("ollama/llama3.2:latest")).toBe(false);
  });

  it("was not quietly repopulated by hand", () => {
    // The guard that makes the two above mean something. Every entry must
    // carry a result for EVERY probe the contract defines, all passing — the
    // shape `scripts/model-contract.ts --record` writes. A hand-added entry
    // with two probes, or one with a failure, is refused here rather than
    // being trusted because the file says the right words.
    for (const m of QUALIFICATION.models) {
      expect(m.probes.map((p) => p.id).sort(), m.id).toEqual(PROBES.map((p) => p.id).sort());
      expect(m.probes.every((p) => p.passed), m.id).toBe(true);
      expect(m.baseUrl, m.id).toBe("http://127.0.0.1:20128");
    }
  });

  it("re-qualification is a documented command, not folklore", () => {
    // When someone re-runs the probes and this file gains entries, the tests
    // above start asserting them. Until then the path back is written down
    // where the failure is read.
    const record = JSON.stringify(QUALIFICATION);
    expect(record).toMatch(/scripts\/model-contract\.ts/);
    expect(record).toMatch(/do not hand-write entries here/i);
  });
});

describe("the probes cannot be silently made cacheable again", () => {
  it("sends a unique request-id line, because the gateway caches on message content", () => {
    // Measured: an identical prompt returned in 0.08s where a novel one took
    // 28.99s, and varying `seed` or `user` did NOT miss the cache. Without
    // this, every run after the first grades a stored string and the contract
    // passes for a model that is no longer there.
    const src = readFileSync("kernel/models/contract.ts", "utf8");
    expect(src).toMatch(/function withNonce/);
    expect(src).toMatch(/content: withNonce\(probe\.prompt\)/);
  });
});
