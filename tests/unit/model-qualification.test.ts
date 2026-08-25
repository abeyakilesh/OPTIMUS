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

describe("the committed record is real", () => {
  it("holds the two models that were actually run, at the OmniRoute endpoint the app uses", () => {
    expect(qualifiedModelIds().sort()).toEqual(["ollama/llama3.2:latest", "ollama/qwen2.5:7b"]);
    for (const m of QUALIFICATION.models) {
      expect(m.baseUrl).toBe("http://127.0.0.1:20128");
      expect(m.probes.map((p) => p.id).sort()).toEqual(PROBES.map((p) => p.id).sort());
      expect(m.probes.every((p) => p.passed)).toBe(true);
    }
  });

  it("carries every probe the current contract defines — a new probe invalidates old entries", () => {
    // If a probe is added without bumping CONTRACT_VERSION, existing entries
    // would silently count as qualified against a contract they never faced.
    for (const m of QUALIFICATION.models) {
      expect(m.probes).toHaveLength(PROBES.length);
    }
  });

  it("is currently fresh — and when this fails, that IS the re-qualification reminder", () => {
    // This test has a deliberate expiry: it goes red maxAgeDays after the
    // record was written. That is the intended behaviour, not a bug to work
    // around, so the failure message says what to do instead of leaving
    // someone guessing why an unrelated PR went red.
    const v = qualificationOf("ollama/llama3.2:latest");
    expect(
      v.qualified,
      v.qualified
        ? ""
        : `The committed qualification has expired or become invalid:\n  ${v.reason}\n` +
          `Re-run it and commit the record:\n` +
          `  npx tsx scripts/model-contract.ts ollama/llama3.2:latest http://127.0.0.1:20128 --record\n` +
          `Do NOT edit kernel/models/qualified.json by hand to make this pass.`,
    ).toBe(true);
    expect(isQualified("ollama/llama3.2:latest")).toBe(true);
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
