import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { Scheduler } from "../../kernel/scheduler";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { ALL_CHECKS, ALL_CAPABILITIES, buildBroker } from "../../kernel/registry";
import { webFetch, htmlExtractTitle, titleNonEmpty, artifactIntact } from "../../kernel/builtin";
import { browserNavigateSucceeded } from "../../kernel/capabilities/browser-use/navigate";
import {
  assertApplicability,
  checkAppliesTo,
  applicableCheckIds,
  validatePlanChecks,
  CheckContractError,
  type CheckApplicability,
} from "../../kernel/checkContract";
import type { Check, MissionSpec } from "../../kernel/types";

/**
 * #71 — a check declares which capabilities it can verify.
 *
 * The defect was OBSERVED, not imagined: the first real compile against
 * llama3.2:3b produced a `web.fetch` step carrying
 * `checks: ["browser.navigateSucceeded"]`. It validated, it ran, and it was
 * guaranteed red, because that check reads a field `web.fetch` never returns.
 * The kernel could refuse an UNREGISTERED check and not an INAPPLICABLE one.
 */

const PAGE = `<html><head><title>Example Domain</title></head><body>hi</body></html>`;

function kernel() {
  const broker = new Broker();
  broker.register(webFetch);
  broker.register(htmlExtractTitle);
  broker.registerCheck(titleNonEmpty);
  broker.registerCheck(artifactIntact);
  broker.registerCheck(browserNavigateSucceeded); // registered, deliberately inapplicable here
  const harness = new Harness({ broker, store: new MemoryArtifactStore(), fetcher: async () => PAGE });
  return { broker, harness };
}

const stub = (id: string, appliesTo: CheckApplicability): Check => ({
  id,
  appliesTo,
  async run() {
    return { checkId: id, passed: true, reason: "stub" };
  },
});

function planPairing(capabilityId: string, checks: string[]): MissionSpec {
  return {
    id: "m-pair",
    objective: "pair a check with a capability",
    steps: [{ id: "s", capabilityId, input: { url: "https://example.com/" }, dependsOn: [], checks }],
  };
}

/* ══ the declaration itself ════════════════════════════════════════════════ */

describe("a check declares what it can verify, and the broker refuses a bad declaration", () => {
  it("refuses a check with no appliesTo at all", () => {
    const naked = { id: "x", async run() { return { checkId: "x", passed: true, reason: "" } } };
    expect(() => new Broker().registerCheck(naked as unknown as Check)).toThrow(/declares no appliesTo/);
  });

  it("refuses an unknown kind", () => {
    expect(() => assertApplicability({ kind: "anything" } as unknown as CheckApplicability, "x")).toThrow(
      /kind must be "outputs" or "capabilities"/,
    );
  });

  it("refuses an EMPTY capability list — it matches nothing and is unreachable", () => {
    expect(() => assertApplicability({ kind: "capabilities", ids: [] }, "x")).toThrow(
      /matches no capability/,
    );
  });

  it("ALLOWS an empty outputs list — it means 'reads nothing from the output'", () => {
    // The asymmetry that the first draft of checkContract.ts got wrong by
    // refusing both with one message. Empty ids matches NOTHING; empty
    // requires matches EVERYTHING, vacuously. A validator that treats "empty"
    // as one concept gets one of the two backwards.
    expect(() => assertApplicability({ kind: "outputs", requires: [] }, "x")).not.toThrow();
    expect(checkAppliesTo({ kind: "outputs", requires: [] }, webFetch.manifest)).toBe(true);
  });

  it("refuses a non-string entry in either kind", () => {
    expect(() => assertApplicability({ kind: "outputs", requires: [""] }, "x")).toThrow(/empty entry/);
    expect(() =>
      assertApplicability({ kind: "capabilities", ids: [1 as unknown as string] }, "x"),
    ).toThrow(/non-string/);
  });

  it("every REGISTERED check declares applicability, and it is well-formed", () => {
    for (const check of ALL_CHECKS) {
      expect(check.appliesTo, check.id).toBeDefined();
      expect(() => assertApplicability(check.appliesTo, check.id), check.id).not.toThrow();
    }
  });

  it("every registered check applies to at least one registered capability", () => {
    // Anti-rot, not decoration: a check nothing can pair with is dead weight
    // that still appears in the registry and in the compiler's vocabulary.
    for (const check of ALL_CHECKS) {
      const matches = ALL_CAPABILITIES.filter((c) => checkAppliesTo(check.appliesTo, c.manifest));
      expect(matches.length, `${check.id} applies to nothing`).toBeGreaterThan(0);
    }
  });
});

/* ══ what each kind actually means ═════════════════════════════════════════ */

describe("the two kinds answer different questions", () => {
  it("outputs: applies to ANY capability declaring the field, and cannot go stale", () => {
    // `artifact.intact`'s whole reason for being field-scoped. Five today; a
    // sixth is covered the moment it registers, with no list to remember.
    const byField = ALL_CAPABILITIES.filter((c) =>
      checkAppliesTo({ kind: "outputs", requires: ["artifactId"] }, c.manifest),
    ).map((c) => c.manifest.id);
    expect(byField).toContain("web.fetch");
    expect(byField).toContain("html.extractTitle");
    expect(byField.length).toBeGreaterThanOrEqual(5);
  });

  it("outputs: title.nonEmpty covers browser.navigate too — the old hardcoded map did not", () => {
    // The map listed html.extractTitle only. The check reads `output.title`
    // and browser.navigate returns one, so the map was narrower than the code.
    const ids = ALL_CAPABILITIES.filter((c) => checkAppliesTo(titleNonEmpty.appliesTo, c.manifest)).map(
      (c) => c.manifest.id,
    );
    expect(ids).toEqual(expect.arrayContaining(["html.extractTitle", "browser.navigate"]));
  });

  it("capabilities: separates two checks that read the SAME field", () => {
    // `llm.chatSucceeded` and `browser.navigateSucceeded` both read `ok`.
    // A field rule would make each apply to the other's capability — true
    // about the shape, false about the meaning. This is why both kinds exist.
    const llm = ALL_CAPABILITIES.find((c) => c.manifest.id === "llm.chat")!;
    const browser = ALL_CAPABILITIES.find((c) => c.manifest.id === "browser.navigate")!;
    expect(checkAppliesTo(browserNavigateSucceeded.appliesTo, browser.manifest)).toBe(true);
    expect(checkAppliesTo(browserNavigateSucceeded.appliesTo, llm.manifest)).toBe(false);

    // And the field rule that WOULD have conflated them, asserted so the
    // reasoning above is checked rather than believed.
    const byOk: CheckApplicability = { kind: "outputs", requires: ["ok"] };
    expect(checkAppliesTo(byOk, browser.manifest)).toBe(true);
    expect(checkAppliesTo(byOk, llm.manifest)).toBe(true);
  });
});

/* ══ plan time — the refusal ═══════════════════════════════════════════════ */

describe("a plan pairing a check with a capability it cannot read is refused", () => {
  it("refuses before the mission runs, naming the check and both capabilities", () => {
    const { broker } = kernel();
    let message = "";
    try {
      validatePlanChecks(planPairing("web.fetch", ["browser.navigateSucceeded"]), broker);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("browser.navigateSucceeded");
    expect(message).toContain("web.fetch");
    expect(message).toContain("browser.navigate");
  });

  it("explains a FIELD failure by naming the field and what the capability returns", () => {
    const broker = new Broker();
    broker.register(webFetch);
    broker.registerCheck(titleNonEmpty); // needs `title`; web.fetch returns artifactId + bytes
    let message = "";
    try {
      validatePlanChecks(planPairing("web.fetch", ["title.nonEmpty"]), broker);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/title/);
    expect(message).toMatch(/artifactId/);
  });

  it("accepts an applicable pairing", () => {
    const { broker } = kernel();
    expect(() => validatePlanChecks(planPairing("web.fetch", ["artifact.intact"]), broker)).not.toThrow();
  });

  it("an UNREGISTERED check fails as unregistered, not as inapplicable", () => {
    // Two different failures, and the message has to say which. A plan naming
    // a typo should not be told its check "does not apply".
    const { broker } = kernel();
    expect(() => validatePlanChecks(planPairing("web.fetch", ["nope.missing"]), broker)).toThrow(
      /No such check/,
    );
  });

  it("THE SCHEDULER refuses it — not merely the helper", () => {
    // The guarantee is worthless if only a function nobody calls enforces it.
    const { broker, harness } = kernel();
    const scheduler = new Scheduler({ harness });
    return expect(
      scheduler.run(planPairing("web.fetch", ["browser.navigateSucceeded"])),
    ).rejects.toThrow(/does not apply/);
  });
});

/* ══ the compiler's offer list ═════════════════════════════════════════════ */

describe("the compiler offers only checks that can verify what it offered", () => {
  it("drops a check no offered capability can be verified by", () => {
    const offered = applicableCheckIds([webFetch.manifest], [...ALL_CHECKS]);
    expect(offered).toContain("artifact.intact");
    expect(offered).not.toContain("browser.navigateSucceeded");
    expect(offered).not.toContain("llm.chatSucceeded");
    expect(offered).not.toContain("relocate.foundMatch");
  });

  it("is derived from the checks, so a new check needs no second edit", () => {
    // The `CHECK_APPLICABILITY` map this replaced was a second copy of one
    // fact and was already wrong. A stub registered here is offered purely
    // because of what it declares — nothing else was told about it.
    const invented = stub("invented.always", { kind: "outputs", requires: ["bytes"] });
    expect(applicableCheckIds([webFetch.manifest], [invented])).toEqual(["invented.always"]);
    expect(applicableCheckIds([htmlExtractTitle.manifest], [invented])).toEqual([]);
  });
});

/* ══ mutation — remove the pairing check and watch these go red ════════════ */

describe("mutation: the refusals fail when the pairing check is removed", () => {
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

  it("PLAN: without the pairing refusal, an inapplicable check validates fine", async () => {
    await withMutant(
      join("kernel", "checkContract.ts"),
      [[/if \(checkAppliesTo\(check\.appliesTo, manifest\)\) continue;/, "continue;"]],
      async (url) => {
        const mutant = (await import(url)) as { validatePlanChecks: typeof validatePlanChecks };
        const { broker } = kernel();
        // THE ASSERTION THAT MAKES THE REFUSALS REAL.
        expect(() =>
          mutant.validatePlanChecks(planPairing("web.fetch", ["browser.navigateSucceeded"]), broker),
        ).not.toThrow();
      },
    );
  });

  it("REGISTRATION: without assertApplicability, an empty capability list registers", async () => {
    await withMutant(
      join("kernel", "broker.ts"),
      [[/^\s*assertApplicability\(check\.appliesTo, check\.id\);$/m, ""]],
      async (url) => {
        const mutant = (await import(url)) as { Broker: new () => Broker };
        const dead = stub("dead.check", { kind: "capabilities", ids: [] });
        expect(() => new mutant.Broker().registerCheck(dead)).not.toThrow();
      },
    );
  });

  it("the FIELD rule is load-bearing: inverted, artifact.intact stops matching", async () => {
    // `every` -> `some` would still pass for single-field checks, so the
    // mutation inverts the predicate instead: proof the rule is consulted at
    // all, rather than a constant true hiding behind it.
    await withMutant(
      join("kernel", "checkContract.ts"),
      [[/return applies\.requires\.every\(\(field\) =>/, "return !applies.requires.every((field) =>"]],
      async (url) => {
        const mutant = (await import(url)) as { checkAppliesTo: typeof checkAppliesTo };
        expect(mutant.checkAppliesTo(artifactIntact.appliesTo, webFetch.manifest)).toBe(false);
      },
    );
  });
});

/* ══ the walking skeleton still runs ═══════════════════════════════════════ */

describe("the mission that has to keep working", () => {
  it("compiles and runs green with applicable checks", async () => {
    const broker = buildBroker();
    const harness = new Harness({ broker, store: new MemoryArtifactStore(), fetcher: async () => PAGE });
    const scheduler = new Scheduler({ harness });
    const result = await scheduler.run({
      id: "m-ok",
      objective: "fetch then extract",
      steps: [
        { id: "fetch", capabilityId: "web.fetch", input: { url: "https://example.com/" }, dependsOn: [], checks: ["artifact.intact"] },
        { id: "extract", capabilityId: "html.extractTitle", input: { artifactId: { $from: "fetch.artifactId" } }, dependsOn: ["fetch"], checks: ["title.nonEmpty", "artifact.intact"] },
      ],
    });
    expect(result.state.status).toBe("green");
  });
});
