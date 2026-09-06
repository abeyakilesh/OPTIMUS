import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from "node:fs";

/**
 * THE REGISTRY RULE's gate. The half that matters is the self-updating one: a
 * PR that admits a defect while leaving `docs/DEFECT_CLASSES.md` untouched must
 * go red. Both directions are asserted here — a confession with an untouched
 * registry fails, and a clean PR stays green — because a gate that only ever
 * passes is indistinguishable from no gate (THE MUTATION RULE).
 */

const GATE = "scripts/defect-registry.mjs";
const REGISTRY = "docs/DEFECT_CLASSES.md";

/** git's empty-tree object: diffing HEAD against it lists every tracked file,
 *  and unlike HEAD~1 it exists in CI's shallow clone. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const head = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

function run(env: Record<string, string> = {}): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("node", [GATE], { encoding: "utf8", env: { ...process.env, ...env } }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A diff that DOES include the registry (everything vs nothing). */
const touched = () => ({ BASE_SHA: EMPTY_TREE, HEAD_SHA: head() });
/** A diff that does NOT (a commit against itself). */
const untouched = () => ({ BASE_SHA: head(), HEAD_SHA: head() });

function withMutated(file: string, mutate: (t: string) => string, fn: () => void): void {
  const backup = `${file}.testbak`;
  copyFileSync(file, backup);
  try {
    writeFileSync(file, mutate(readFileSync(file, "utf8")));
    fn();
  } finally {
    copyFileSync(backup, file);
    unlinkSync(backup);
  }
}

const CONFESSION = "While building this I found a real defect — my own mistake, caught by CI.";

describe("the registry gate, both directions", () => {
  it("RED: a PR body admitting a mistake with the registry untouched", () => {
    const r = run({ PR_BODY: CONFESSION, ...untouched() });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/THE REGISTRY RULE/);
    // It must name the phrase that fired, or the author cannot tell what to do.
    expect(r.out).toMatch(/the phrase that fired was/);
    expect(r.out).toMatch(/my own mistake|found a real defect/i);
  });

  it("GREEN: the same body when the registry WAS updated in the same PR", () => {
    const r = run({ PR_BODY: CONFESSION, ...touched() });
    expect(r.out).not.toMatch(/THE REGISTRY RULE/);
  });

  it("GREEN: an ordinary PR body that admits nothing", () => {
    const r = run({ PR_BODY: "Adds a settings panel and two tests.", ...untouched() });
    expect(r.out).not.toMatch(/THE REGISTRY RULE/);
  });

  it("GREEN: a confession with the opt-out box ticked and a reason", () => {
    // The escape valve has to exist, or the gate teaches people to avoid
    // writing honestly about what they found — the opposite of the intent.
    const body = `${CONFESSION}\n\n- [x] No new defect class surfaced in this PR — it is an instance of an existing class already recorded.`;
    const r = run({ PR_BODY: body, ...untouched() });
    expect(r.out).not.toMatch(/THE REGISTRY RULE/);
  });

  it("stays silent when there is no PR body at all — local runs are not PRs", () => {
    expect(run().out).not.toMatch(/THE REGISTRY RULE/);
  });
});

describe("the registry stays internally true", () => {
  it("reports the counts it derives, rather than any typed number", () => {
    const r = run();
    expect(r.out).toMatch(/classes recorded: \*\*\d+\*\*/);
    expect(r.out).toMatch(/UNDETECTED: \d+/);
  });

  it("fails when the coverage line disagrees with the row count", () => {
    withMutated(REGISTRY, (t) => t.replace(/^> \*\*\d+ classes/m, "> **3 classes"), () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/Coverage line disagrees with the rows/);
    });
  });

  it("fails when a Detection names a file that no longer exists", () => {
    // The stale-single-source class, applied to this file: a mechanism that
    // was renamed still reads as a live defence.
    withMutated(REGISTRY, (t) => t.replace("`scripts/gate-coverage.mjs` ::", "`scripts/deleted-thing.mjs` ::"), () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/scripts\/deleted-thing\.mjs.*does not exist/);
    });
  });

  it("fails when an instance cites no PR, issue or commit", () => {
    withMutated(REGISTRY, (t) =>
      t.replace(/\*\*Instances:\*\* PR #57 — `scrapling\.relocate` reported/, "**Instances:** I remember this happening once. It reported"),
    () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/cites no PR, issue or commit/);
    });
  });

  it("--update rewrites the coverage line instead of failing on it", () => {
    withMutated(REGISTRY, (t) => t.replace(/^> \*\*\d+ classes/m, "> **3 classes"), () => {
      const r = (() => {
        try {
          return { code: 0, out: execFileSync("node", [GATE, "--update"], { encoding: "utf8" }) };
        } catch (e) {
          const err = e as { status?: number; stdout?: string };
          return { code: err.status ?? 1, out: err.stdout ?? "" };
        }
      })();
      expect(r.code).toBe(0);
      expect(r.out).toMatch(/Coverage line updated/);
      expect(readFileSync(REGISTRY, "utf8")).not.toMatch(/^> \*\*3 classes/m);
    });
  });
});
