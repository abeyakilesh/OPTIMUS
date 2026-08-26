import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

/**
 * `kernel/cli.ts` had ZERO CI coverage. It existed only as `npm run mission` in
 * package.json, which meant the walking-skeleton demo — the thing that is
 * supposed to show the pipe works end to end — was verified by someone
 * remembering to run it.
 *
 * That is how facade #2 survived in there: `extract` took a constant computed
 * in the CLI while declaring `dependsOn: ["fetch"]`, and the demo printed a
 * green mission the whole time. It is also how #66 captured the `fail` demo
 * without anyone noticing for the length of one PR.
 *
 * So these tests pin WHICH GATE each demo demonstrates, not merely that one is
 * green and the other red. `new-door-inherits-old-failures`: a test asserting a
 * failure must name the gate that produced it, or the next validation layer
 * added upstream inherits the assertion and nothing goes red.
 */

const ANSI = new RegExp(String.fromCharCode(27) + "\\[\\d+m", "g");

interface DemoRun {
  status: number;
  output: string;
}

/**
 * Terminal colour is presentation; strip it before matching on content.
 *
 * The exit code is captured rather than allowed to throw, because it is one of
 * the things worth asserting: a red mission that exits 0 is a CI-shaped facade
 * — every gate green while the demo says the mission failed.
 */
function runDemo(...args: string[]): DemoRun {
  try {
    const stdout = execFileSync("npx", ["tsx", "kernel/cli.ts", ...args], {
      encoding: "utf8",
      timeout: 120_000,
    });
    return { status: 0, output: stdout.replace(ANSI, "") };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    if (e.stdout === undefined) throw error; // the CLI never ran at all
    return { status: e.status ?? 1, output: `${e.stdout}${e.stderr ?? ""}`.replace(ANSI, "") };
  }
}

describe("the walking-skeleton demo, run for real", () => {
  const { status, output } = runDemo();

  it("goes green with both steps passing, and exits 0", () => {
    expect(status).toBe(0);
    expect(output).toMatch(/MISSION GREEN/);
    expect(output).toMatch(/fetch \(web\.fetch\) · passed/);
    expect(output).toMatch(/extract \(html\.extractTitle\) · passed/);
  });

  it("names the CAPABILITY that ran, not the agent label", () => {
    // `agent` is a name a plan author chose; `capabilityId` is what executed.
    expect(output).toMatch(/\(web\.fetch\)/);
    expect(output).not.toMatch(/\(collector\)/);
  });

  it("shows the edge carrying data, which is the whole point of the demo", () => {
    // If this line disappears, `extract` has gone back to a constant and the
    // dependency edge is decorative again.
    expect(output).toMatch(
      /extract: extract\.input\.artifactId ← fetch\.artifactId · sha256:[0-9a-f]{64}/,
    );
  });

  it("extracts the real title, whitespace normalised", () => {
    expect(output).toMatch(/title\.nonEmpty — title is 14 chars/);
  });
});

describe("the fault-injection demo blocks at VERIFICATION, specifically", () => {
  const { status, output } = runDemo("fail");

  it("goes red, and says so with a non-zero exit", () => {
    // A red mission exiting 0 would let any CI step that runs this demo pass.
    expect(status).not.toBe(0);
    expect(output).toMatch(/MISSION RED/);
    expect(output).toMatch(/extract \(html\.extractTitle\) · failed/);
  });

  it("is blocked by title.nonEmpty — the check, not an earlier door", () => {
    // THE ASSERTION THIS FILE EXISTS FOR. The sabotaged capability returns a
    // WELL-FORMED lie, so nothing upstream of verification has grounds to
    // refuse it. When #66 added the output door, the sabotage was returning
    // `artifactId: undefined` and the demo silently started failing there
    // instead — still red, no longer demonstrating anything about verification.
    expect(output).toMatch(/title\.nonEmpty — expected a non-empty title/);
    expect(output).not.toMatch(/capability\.completed/);
    expect(output).not.toMatch(/output does not match its declared outputs/);
    expect(output).not.toMatch(/input\.unresolvable/);
  });

  it("still passes the checks that legitimately hold, so the failure is specific", () => {
    // artifact.intact passes: the sabotaged output really did store an
    // artifact. A demo where everything goes red proves less than one where
    // exactly the right thing does.
    expect(output).toMatch(/artifact\.intact — artifact sha256:/);
    expect(output).toMatch(/fetch \(web\.fetch\) · passed/);
  });
});
