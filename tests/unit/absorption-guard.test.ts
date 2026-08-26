import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * `absorption-guard.mjs` enforces CLAUDE.md's scoring rules on every PR, and
 * until now **nothing enforced the enforcer**. Its rubric maxima are hardcoded
 * integers; when the rubric changed (#40: Safety 25→30, Integration 15→10)
 * there was no test to go red if they had been left behind. A guard that has
 * silently stopped matching the rule it guards still prints "Absorption rules
 * satisfied."
 *
 * ⚠️ KNOWN GAP, stated rather than discovered later. CLAUDE.md now lives
 * OUTSIDE this repo (it is gitignored — see build-bible.test.ts), so CI cannot
 * read the rubric it is supposed to be enforcing. These tests pin the guard to
 * the values the rubric had **when they were written**; they cannot detect the
 * rubric changing again without the guard. That is a direct, accepted cost of
 * keeping the bible private, and it is the same class of gap the bible's own
 * header records as UNENFORCED.
 */

const GUARD = "scripts/absorption-guard.mjs";

function runGuard(
  body: string,
  title = "absorb/example: SERVICE",
  shas: { base?: string; head?: string } = {},
): { code: number; out: string } {
  try {
    const out = execFileSync("node", [GUARD], {
      encoding: "utf8",
      env: {
        ...process.env,
        PR_BODY: body,
        PR_TITLE: title,
        BASE_SHA: shas.base ?? "",
        HEAD_SHA: shas.head ?? "",
      },
    });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** A breakdown in the table shape the guard parses. */
function breakdown(p: {
  fidelity: number; safety: number; robustness: number; integration: number; proof: number;
}): string {
  return [
    `| Fidelity | 35 | ${p.fidelity} |`,
    `| Safety | 30 | ${p.safety} |`,
    `| Robustness | 15 | ${p.robustness} |`,
    `| Integration | 10 | ${p.integration} |`,
    `| Proof coverage | 10 | ${p.proof} |`,
  ].join("\n");
}

describe("the absorption guard enforces the CURRENT rubric", () => {
  it("uses Safety/30 and Integration/10 — the #40 maxima, not the old 25 and 15", () => {
    // Direct source assertion. If someone changes the rubric and forgets the
    // guard, the guard keeps passing PRs against a rule that no longer exists,
    // and the behavioural tests below cannot tell the difference.
    const src = readFileSync(GUARD, "utf8");
    expect(src).toMatch(/grab\("Safety",\s*30\)/);
    expect(src).toMatch(/grab\("Integration",\s*10\)/);
    expect(src).toMatch(/parts\.Safety !== 30/);
    expect(src).not.toMatch(/grab\("Safety",\s*25\)/);
  });

  it("accepts a well-formed, honest score", () => {
    const body = `Absorption Score: 61/100\n\n${breakdown({ fidelity: 10, safety: 25, robustness: 10, integration: 10, proof: 6 })}`;
    const r = runGuard(body);
    expect(r.out).toMatch(/Absorption rules satisfied/);
    expect(r.code).toBe(0);
  });

  it("rejects arithmetic that does not add up", () => {
    // The components sum to 61; the PR claims 95.
    const body = `Absorption Score: 95/100\n\n${breakdown({ fidelity: 10, safety: 25, robustness: 10, integration: 10, proof: 6 })}`;
    const r = runGuard(body);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/arithmetic does not add up/i);
  });

  it("rejects a missing breakdown — a bare number is not an honest score", () => {
    const r = runGuard("Absorption Score: 61/100 and nothing else.");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/breakdown incomplete/i);
  });

  it("rejects AVAILABLE claimed with PARTIAL safety, even at a high total", () => {
    // 92/100 overall, but one of the six boundaries is not wired. Directive #4:
    // safety is never partial credit.
    const body = `Absorption Score: 92/100 — capability is AVAILABLE\n\n${breakdown({ fidelity: 32, safety: 25, robustness: 15, integration: 10, proof: 10 })}`;
    const r = runGuard(body);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Safety 25\/30/);
    expect(r.out).toMatch(/never partial credit/i);
  });

  it("rejects AVAILABLE below 90 even with full safety", () => {
    const body = `Absorption Score: 85/100 — AVAILABLE\n\n${breakdown({ fidelity: 30, safety: 30, robustness: 10, integration: 10, proof: 5 })}`;
    const r = runGuard(body);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Requires >=90/);
  });

  it("rejects AVAILABLE with fidelity below 30/35", () => {
    const body = `Absorption Score: 90/100 — AVAILABLE\n\n${breakdown({ fidelity: 25, safety: 30, robustness: 15, integration: 10, proof: 10 })}`;
    const r = runGuard(body);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/Fidelity 25\/35/);
  });

  it("accepts AVAILABLE when all six boundaries are wired and the total earns it", () => {
    const body = `Absorption Score: 92/100 — AVAILABLE\n\n${breakdown({ fidelity: 32, safety: 30, robustness: 15, integration: 10, proof: 5 })}`;
    const r = runGuard(body);
    expect(r.out).toMatch(/Absorption rules satisfied/);
    expect(r.code).toBe(0);
  });

  it("rejects a PR with no score at all — 0/100 is valid, absent is not", () => {
    const r = runGuard("A PR body that never mentions a score.");
    expect(r.code).toBe(1);
  });
});

describe("it can still tell WHICH PRs it applies to", () => {
  it("recognises this repo's actual title convention, absorb/<repo>:", () => {
    // The original regex was /^absorb[:(]/ and every real absorption PR here
    // is titled `absorb/scrapling: ...`. It never matched, so the body's
    // **Fate:** line was the only working detector — drop that line and the
    // whole score check skipped while still printing success.
    const r = runGuard("A body with no score.", "absorb/scrapling: PORT the selector engine");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/No Absorption Score found/);
  });

  it("recognises a Fate line even when the title says nothing", () => {
    const r = runGuard("**Fate:** PORT\n\nno score here", "chore: something");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/No Absorption Score found/);
  });

  it("leaves ordinary kernel/CI PRs alone", () => {
    const r = runGuard("A normal kernel change with no absorption in it.", "kernel: wire rollback");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/Not an absorption PR/);
  });

  it("looks for capabilities under kernel/capabilities/, the path they are actually at", () => {
    // Source assertion: `capabilities/` matched nothing in this repo, so both
    // the one-repo-per-PR check and file-based detection were dead code.
    const src = readFileSync(GUARD, "utf8");
    expect(src).toMatch(/CAP_PREFIX = "kernel\/capabilities\/"/);
    expect(src).not.toMatch(/startsWith\("capabilities\/"\)/);
  });
});

describe("the file-based checks run against a REAL diff", () => {
  // The bug these exist for: CAP_PREFIX was declared after its first use, a
  // TDZ ReferenceError that only fires when `changed` is non-empty. Every
  // test above leaves BASE_SHA/HEAD_SHA unset, so `changed` is [] and
  // `.some()` never invokes the callback — the guard's entire file-based half
  // was untested by its own test file, which is the same "check that cannot
  // fire" defect the guard was being fixed for.
  const rev = (r: string) => execFileSync("git", ["rev-parse", r], { encoding: "utf8" }).trim();

  // git's well-known empty-tree object. Diffing HEAD against it lists every
  // tracked file, which is all these tests need — and unlike HEAD~1 it exists
  // in a SHALLOW clone. CI checks out at depth 1, so the first version of
  // these tests passed locally and failed in CI on `HEAD~1` not existing.
  const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

  it("detects capabilities from the file list, and counts them", () => {
    // Diffing HEAD against the empty tree lists every tracked file, so all
    // three kernel/capabilities entries appear. Two previously-dead checks
    // fire here for the first time: file-based absorption detection, and
    // one-repo-per-PR. Before the prefix fix both were unreachable.
    const r = runGuard("A normal change.", "chore: something", { base: EMPTY_TREE, head: rev("HEAD") });
    expect(r.out).not.toMatch(/ReferenceError/);
    expect(r.out).toMatch(/This PR absorbs 3 repos/);
    expect(r.out).toMatch(/browser-use/);
    expect(r.out).toMatch(/omniroute/);
    expect(r.out).toMatch(/scrapling-relocate/);
    expect(r.code).toBe(1);
  });

  it("still reaches its verdict with a populated diff and an absorption title", () => {
    const r = runGuard("No score in this body.", "absorb/example: PORT", { base: EMPTY_TREE, head: rev("HEAD") });
    expect(r.out).not.toMatch(/ReferenceError/);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/No Absorption Score found/);
  });

  /**
   * #65. The guard demanded an Absorption Score from a PR that added a
   * required `trust` field to llm.chat's manifest — absorbing nothing. It
   * keyed on any change under kernel/capabilities/, and `--name-only` cannot
   * tell an edit from an addition.
   *
   * Both directions are asserted, because narrowing a detector is one
   * character away from disabling it.
   */
  describe("absorption means a capability was ADDED, not touched", () => {
    /** Located from history rather than hardcoded, so a rename cannot rot it. */
    const commitThat = (filter: string, path: string) => {
      const sha = execFileSync(
        "git",
        ["log", `--diff-filter=${filter}`, "--format=%H", "-1", "--", path],
        { encoding: "utf8" },
      ).trim();
      if (!sha) throw new Error(`no ${filter} commit for ${path} — this test no longer tests what it says`);
      return sha;
    };
    const CAP = "kernel/capabilities/scrapling-relocate.ts";

    it("does NOT demand a score when a capability was only EDITED", () => {
      const head = commitThat("M", CAP);
      const r = runGuard("An ordinary kernel change.", "kernel: adjust a manifest", {
        base: rev(`${head}^`),
        head,
      });
      expect(r.out).toMatch(/Not an absorption PR/);
      expect(r.out).not.toMatch(/No Absorption Score found/);
      expect(r.code).toBe(0);
    });

    it("STILL demands one when a capability was ADDED — narrowing must not disable", () => {
      const head = commitThat("A", CAP);
      const r = runGuard("No score in this body.", "kernel: something", { base: rev(`${head}^`), head });
      expect(r.out).toMatch(/No Absorption Score found/);
      expect(r.code).toBe(1);
    });
  });

  it("rejects a malformed SHA instead of handing it to git", () => {
    const r = runGuard("body", "chore: x", { base: "not-a-sha; rm -rf /", head: rev("HEAD") });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/BASE_SHA is not a valid commit SHA/);
  });
});
