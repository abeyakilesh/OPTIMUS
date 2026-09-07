import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { ALL_CHECKS } from "../../kernel/registry";
import { webFetch, htmlExtractTitle, titleNonEmpty, artifactIntact } from "../../kernel/builtin";
import {
  VERIFICATION_TYPES,
  assertVerificationMethods,
  assertResultMethod,
  VerificationError,
  type VerificationType,
} from "../../kernel/verification";
import type { Check } from "../../kernel/types";

/**
 * #63 — a check says HOW it knows.
 *
 * Before this, a check that read a returned string and a check that re-read
 * bytes through an integrity-verifying store produced identical evidence:
 * `passed: true` either way. Atlas §14 — "do not claim stronger evidence than
 * actually exists" — could not be stated, so it could not be checked.
 */

const PAGE = `<html><head><title>Example Domain</title></head><body>hi</body></html>`;

const check = (id: string, methods: VerificationType[], claims: VerificationType): Check => ({
  id,
  appliesTo: { kind: "outputs", requires: [] },
  verification: methods,
  async run() {
    return { checkId: id, passed: true, verification: claims, reason: "stub" };
  },
});

function kernel(...checks: Check[]) {
  const broker = new Broker();
  broker.register(webFetch);
  broker.register(htmlExtractTitle);
  for (const c of checks) broker.registerCheck(c);
  const store = new MemoryArtifactStore();
  const harness = new Harness({ broker, store, fetcher: async () => PAGE });
  return { broker, harness, store };
}

const step = (checks: string[]) => ({
  id: "s",
  capabilityId: "web.fetch",
  input: { url: "https://example.com/" },
  dependsOn: [],
  checks,
});

/* ══ the declaration ═══════════════════════════════════════════════════════ */

describe("a check declares the methods it may use", () => {
  it("refuses a check that declares none at all", () => {
    const naked = {
      id: "x",
      appliesTo: { kind: "outputs", requires: [] },
      async run() {
        return { checkId: "x", passed: true, verification: "reasoned", reason: "" };
      },
    };
    expect(() => new Broker().registerCheck(naked as unknown as Check)).toThrow(
      /declares no verification methods/,
    );
  });

  it("refuses an EMPTY list — unlike appliesTo, there is no meaningful reading", () => {
    // `appliesTo: { requires: [] }` legitimately means "applies anywhere".
    // An empty method list has no such reading: every result would be refused
    // by the harness, so the check could never pass.
    expect(() => assertVerificationMethods([], "x")).toThrow(/non-empty/);
  });

  it("refuses a method outside the vocabulary", () => {
    expect(() => assertVerificationMethods(["proven" as VerificationType], "x")).toThrow(
      /is not a verification method/,
    );
  });

  it("every REGISTERED check declares well-formed methods", () => {
    for (const c of ALL_CHECKS) {
      expect(c.verification, c.id).toBeDefined();
      expect(() => assertVerificationMethods(c.verification, c.id), c.id).not.toThrow();
    }
  });

  it("the vocabulary is three, and each value is actually used somewhere", () => {
    // Anti-taxonomy guard, and the reason provenance.ts cut trust to four:
    // a vocabulary with more values than the system produces is
    // `advertised-not-measured` wearing a taxonomy. If a value here is never
    // reachable, it should be deleted rather than left looking available.
    expect([...VERIFICATION_TYPES]).toEqual(["reasoned", "observed", "measured"]);
    const declared = new Set(ALL_CHECKS.flatMap((c) => [...c.verification]));
    expect(declared).toContain("reasoned");
    expect(declared).toContain("observed");
    // `measured` is produced by the kernel's own budget result, not by a
    // registered check — asserted in the harness section below rather than here.
  });
});

/* ══ what the real checks claim ════════════════════════════════════════════ */

describe("the classification is honest about what each check actually does", () => {
  it("title.nonEmpty is reasoned — it reads a returned string", () => {
    expect([...titleNonEmpty.verification]).toEqual(["reasoned"]);
  });

  it("artifact.intact is observed — it re-reads through a store that re-derives", () => {
    // The one check in the kernel that earns the stronger label, and the
    // reason #63 exists: before this, it rendered identically to the line above.
    expect([...artifactIntact.verification]).toEqual(["observed"]);
  });

  it("the two produce DIFFERENT evidence on the same green mission", async () => {
    // The end-to-end proof. Two passing checks, two different methods, and a
    // reader can now tell which is which.
    const { harness, store } = kernel(titleNonEmpty, artifactIntact);
    const outcome = await harness.runStep({
      id: "s",
      capabilityId: "html.extractTitle",
      // The harness's OWN store — a second instance would not hold this id,
      // and the step would fail for an unrelated reason.
      input: { artifactId: await store.put(PAGE) },
      dependsOn: [],
      checks: ["title.nonEmpty", "artifact.intact"],
    });
    const byId = Object.fromEntries(outcome.evidence.checks.map((c) => [c.checkId, c.verification]));
    expect(byId["title.nonEmpty"]).toBe("reasoned");
    expect(byId["artifact.intact"]).toBe("observed");
  });
});

/* ══ the run-time refusal — the half with teeth ════════════════════════════ */

describe("a result may not claim a method the check never declared", () => {
  it("refuses a check claiming observed when it declared only reasoned", () => {
    expect(() =>
      assertResultMethod(["reasoned"], "observed", "s.overclaim"),
    ).toThrow(/did not declare/);
  });

  it("names Atlas §14 in the refusal, because that is the rule being enforced", () => {
    let message = "";
    try {
      assertResultMethod(["reasoned"], "observed", "s.x");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/do not claim stronger evidence than actually exists/);
  });

  it("refuses a value that is not a method at all", () => {
    expect(() => assertResultMethod(["reasoned"], undefined, "s.x")).toThrow(VerificationError);
    expect(() => assertResultMethod(["reasoned"], "very sure", "s.x")).toThrow(/not one of/);
  });

  it("accepts a declared method", () => {
    expect(() => assertResultMethod(["reasoned", "observed"], "observed", "s.x")).not.toThrow();
  });

  it("THE HARNESS enforces it — an overclaiming check FAILS its step", async () => {
    // A guarantee only a helper enforces is not a guarantee. The overclaimer
    // declares `reasoned` and returns `observed`; the step must go red rather
    // than record a pass with a note.
    const overclaim = check("liar.check", ["reasoned"], "observed");
    const { harness } = kernel(overclaim);
    const outcome = await harness.runStep(step(["liar.check"]));
    expect(outcome.status).not.toBe("passed");
    const failed = outcome.evidence.checks.find((c) => !c.passed);
    expect(failed?.reason).toMatch(/did not declare/);
  });

  it("a check declaring BOTH may report either, run to run", async () => {
    // The fidelity-harness shape: re-run the parent where it is available,
    // integrity-pin where it is not, and say which on every run.
    const varies = check("varies.check", ["reasoned", "observed"], "observed");
    const { harness } = kernel(varies);
    const outcome = await harness.runStep(step(["varies.check"]));
    expect(outcome.status).toBe("passed");
    expect(outcome.evidence.checks[0].verification).toBe("observed");
  });
});

/* ══ the kernel's own results ══════════════════════════════════════════════ */

describe("the kernel labels the results it synthesises", () => {
  it("a step with no checks is refused as reasoned — nothing was run", async () => {
    const { harness } = kernel();
    const outcome = await harness.runStep(step([]));
    const declared = outcome.evidence.checks.find((c) => c.checkId === "verification.declared");
    expect(declared?.verification).toBe("reasoned");
  });

  it("budget exhaustion is MEASURED — the numbers are the evidence", () => {
    // The only place the kernel earns `measured`, and the reason the third
    // value exists at all rather than being a taxonomy entry nothing reaches.
    const source = readFileSync(join("kernel", "harness.ts"), "utf8");
    expect(source).toMatch(/checkId: "budget",[\s\S]{0,400}?verification: "measured"/);
  });
});

/* ══ mutation ══════════════════════════════════════════════════════════════ */

describe("mutation: the refusals fail when the enforcement is removed", () => {
  async function withMutant<T>(
    source: string,
    mutations: Array<[RegExp, string]>,
    body: (moduleUrl: string) => Promise<T>,
  ): Promise<T> {
    const original = readFileSync(source, "utf8");
    let mutated = original;
    for (const [pattern, replacement] of mutations) {
      expect(pattern.test(mutated), `mutation target ${pattern} is gone from ${source}`).toBe(true);
      mutated = mutated.replace(pattern, replacement);
    }
    expect(mutated).not.toBe(original);
    const path = source.replace(/\.ts$/, `.mutant-${process.pid}-${Date.now()}.ts`);
    writeFileSync(path, mutated, "utf8");
    try {
      return await body(pathToFileURL(resolve(path)).href);
    } finally {
      unlinkSync(path);
    }
  }

  it("RUN TIME: without the declared-method check, an overclaim is accepted", async () => {
    await withMutant(
      join("kernel", "verification.ts"),
      [[/if \(!declared\.includes\(claimed\)\) \{/, "if (false) {"]],
      async (url) => {
        const mutant = (await import(url)) as { assertResultMethod: typeof assertResultMethod };
        // THE ASSERTION THAT MAKES THE REFUSALS REAL.
        expect(() => mutant.assertResultMethod(["reasoned"], "observed", "s.x")).not.toThrow();
      },
    );
  });

  it("REGISTRATION: without assertVerificationMethods, an empty list registers", async () => {
    await withMutant(
      join("kernel", "broker.ts"),
      [[/^\s*assertVerificationMethods\(check\.verification, check\.id\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Broker: new () => Broker };
        const empty: Check = {
          id: "empty.methods",
          appliesTo: { kind: "outputs", requires: [] },
          verification: [],
          async run() {
            return { checkId: "empty.methods", passed: true, verification: "reasoned", reason: "" };
          },
        };
        expect(() => new mutant.Broker().registerCheck(empty)).not.toThrow();
      },
    );
  });
});
