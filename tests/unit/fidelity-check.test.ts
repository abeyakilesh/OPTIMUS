import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, mkdtempSync, cpSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Gate 11's harness (#34). Mostly failure cases, for the same reason as the
 * model contract: running it against good inputs proves the inputs are good,
 * not that the harness would notice bad ones.
 */

const HARNESS = "scripts/fidelity-check.mjs";
const REAL_MANIFEST = "kernel/fixtures/goldens.json";

/**
 * A private copy of the fixture set, per test file.
 *
 * These tests mutate goldens to prove the gate can fail. Vitest runs test FILES
 * in parallel, so mutating the real fixture raced
 * tests/kernel/sequence-matcher.test.ts — which reads the same golden and
 * briefly saw `expected: 0.999`, failing a port that was perfectly correct.
 * A mutation test that writes shared state is a flake generator for every suite
 * that reads it, and the failure lands on the innocent file.
 */
const SANDBOX = mkdtempSync(join(tmpdir(), "optimus-fidelity-"));
cpSync("kernel/fixtures", join(SANDBOX, "fixtures"), { recursive: true });

const MANIFEST = join(SANDBOX, "goldens.json");
{
  const m = JSON.parse(readFileSync(REAL_MANIFEST, "utf8"));
  for (const g of m.goldens) {
    g.file = join(SANDBOX, "fixtures", g.file.replace(/^kernel\/fixtures\//, ""));
    g.generator = join(SANDBOX, "fixtures", g.generator.replace(/^kernel\/fixtures\//, ""));
  }
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
}

function run(): { code: number; out: string } {
  const env = { ...process.env, FIDELITY_MANIFEST: MANIFEST };
  try {
    return { code: 0, out: execFileSync("node", [resolve(HARNESS)], { encoding: "utf8", env }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** Run a mutation with the file restored afterwards even if the test throws. */
function withMutated(file: string, mutate: (text: string) => string, fn: () => void): void {
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

describe("gate 11 passes on the committed tree", () => {
  it("is green, and reports coverage as a COUNT rather than a claim", () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Fidelity gate satisfied/);
    // THE COUNTING RULE: the summary must say how many were re-derived, not
    // that fidelity "is verified".
    expect(r.out).toMatch(/re-derived from the real parent\*\*: \*\*\d+\/\d+/);
    expect(r.out).toMatch(/capabilities with a golden: \*\*\d+\/\d+/);
  });

  it("names the capabilities that have NO golden instead of averaging them away", () => {
    const r = run();
    expect(r.out).toMatch(/no golden at all:.*llm\.chat/);
    expect(r.out).toMatch(/no golden at all:.*browser\.navigate/);
  });

  it("actually re-runs CPython difflib — the one parent CI has", () => {
    expect(run().out).toMatch(/sequence-matcher: re-derived from CPython difflib/);
  });

  it("says out loud which golden is only integrity-pinned", () => {
    // The half of gate 11 that is UNENFORCED for scrapling must be visible on
    // every run, not buried in a manifest field nobody opens.
    expect(run().out).toMatch(/scrapling-similarity: integrity-pinned only/);
  });
});

describe("gate 11 can actually fail", () => {
  it("catches a golden edited to make a failing test pass", () => {
    withMutated(join(SANDBOX, "fixtures", "sequence-matcher-golden.json"), (t) => {
      const cases = JSON.parse(t);
      cases[0].expected = 0.999;
      return JSON.stringify(cases, null, 2);
    }, () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/golden CHANGED without its manifest entry/);
      // And the stronger check fires too: re-running the parent disagrees.
      expect(r.out).toMatch(/RE-RAN THE PARENT AND GOT DIFFERENT OUTPUT/);
    });
  });

  it("catches a generator changed without its golden being regenerated", () => {
    // The likeliest drift: someone edits the case list, reruns nothing, and
    // the stale golden keeps passing every existing assertion.
    withMutated(join(SANDBOX, "fixtures", "generate_golden.py"), (t) => t + "\n# added a case, regenerated nothing\n", () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/GENERATOR changed but the golden was not regenerated/);
    });
  });

  it("catches a manifest hash quietly relaxed to match a tampered golden", () => {
    // Defeats the obvious workaround for the first test: edit the golden AND
    // its recorded hash. The re-run of the real parent still refuses.
    withMutated(join(SANDBOX, "fixtures", "sequence-matcher-golden.json"), (t) => {
      const cases = JSON.parse(t);
      cases[0].expected = 0.5;
      const next = JSON.stringify(cases, null, 2);
      const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
      m.goldens[0].sha256 = createHash("sha256").update(next).digest("hex");
      writeFileSync(`${MANIFEST}.testbak2`, readFileSync(MANIFEST));
      writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
      return next;
    }, () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/RE-RAN THE PARENT AND GOT DIFFERENT OUTPUT/);
      copyFileSync(`${MANIFEST}.testbak2`, MANIFEST);
      unlinkSync(`${MANIFEST}.testbak2`);
    });
  });

  it("catches a missing golden file", () => {
    withMutated(MANIFEST, (t) => {
      const m = JSON.parse(t);
      m.goldens[0].file = "kernel/fixtures/does-not-exist.json";
      return JSON.stringify(m, null, 2) + "\n";
    }, () => {
      const r = run();
      expect(r.code).toBe(1);
      expect(r.out).toMatch(/golden file missing/);
    });
  });
});
