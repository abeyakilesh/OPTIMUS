import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

/**
 * Gate 4 — the settings that decide whether the AI security review actually
 * reviews anything.
 *
 * WHY THIS FILE EXISTS. `claude-code-security-review` caches a per-PR marker
 * and, by default, disables itself on every commit after the first while the
 * job still reports SUCCESS. Measured on PR #78: three ai-review jobs, one
 * enabled. The commit that actually merged was never reviewed.
 *
 * A required security gate whose pass can mean "did not run" is the same
 * defect as a capability marked AVAILABLE with no proof behind it. The
 * setting is one line and reverting it is one line, so THE ENFORCEMENT RULE
 * applies: the mechanism keeping it true is this test, named here.
 */

const WORKFLOW = join(".github", "workflows", "_ai-review.yml");

interface Step {
  name?: string;
  uses?: string;
  with?: Record<string, unknown>;
  run?: string;
  env?: Record<string, unknown>;
}

function reviewJobSteps(): Step[] {
  const doc = load(readFileSync(WORKFLOW, "utf8")) as {
    jobs: Record<string, { steps: Step[] }>;
  };
  const job = doc.jobs.review;
  expect(job, "_ai-review.yml no longer has a `review` job").toBeTruthy();
  return job.steps;
}

/** The step that runs the reviewer, found by its action rather than its name. */
function reviewStep(): Step {
  const step = reviewJobSteps().find((s) => s.uses?.includes("claude-code-security-review"));
  expect(step, "no step uses anthropics/claude-code-security-review").toBeTruthy();
  return step as Step;
}

describe("gate 4 reviews the diff that merges", () => {
  it("runs on EVERY commit, not only the first of a PR", () => {
    // Asserted as the parsed value, not as a substring of the file: a `true`
    // sitting in a comment, or under a different step, would satisfy a grep.
    expect(reviewStep().with?.["run-every-commit"]).toBe(true);
  });

  it("still posts its findings to the PR", () => {
    // Reviewing without reporting would make the gate silent rather than
    // absent, which is harder to notice and no more useful.
    expect(reviewStep().with?.["comment-pr"]).toBe(true);
  });

  it("is wired to a model backend, and refuses to pass when none is configured", () => {
    // The backend step exits 1 when no key of any kind is present. An
    // unconfigured security gate must fail, never render as a pass — the
    // reason this repo has no placeholder gates at all.
    const chooser = reviewJobSteps().find((s) => /model backend/i.test(s.name ?? ""));
    expect(chooser, "the backend-selection step is gone").toBeTruthy();
    expect(chooser?.run).toMatch(/exit 1/);
    expect(chooser?.run).toMatch(/Gate 4 unconfigured/);
  });

  it("readiness is decided by whether the gateway ANSWERS, not by an authorised route", () => {
    // `curl -sf` treats 401 as unreachable. OmniRoute's API is authenticated,
    // so the -f form reported a live gateway dead and blocked every PR in the
    // repo. `000` is curl's code for "could not connect" and is the only
    // value that still means not-up.
    const start = reviewJobSteps().find((s) => /Start OmniRoute/i.test(s.name ?? ""));
    expect(start?.run).toMatch(/%\{http_code\}/);
    expect(start?.run).not.toMatch(/curl\s+-sf\s+http:\/\/127\.0\.0\.1:20128\/v1\/models/);
  });

  it("binds the gateway to loopback with the variable OmniRoute actually reads", () => {
    // `HOST` is not OmniRoute's variable; it printed "listening on 0.0.0.0"
    // on every run while the workflow comment claimed loopback-only.
    const start = reviewJobSteps().find((s) => /Start OmniRoute/i.test(s.name ?? ""));
    expect(start?.env?.OMNIROUTE_SERVER_HOST).toBe("127.0.0.1");
  });
});
