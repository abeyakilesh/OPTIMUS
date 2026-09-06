/**
 * Real end-to-end proof for kernel/capabilities/browser-use/: a genuine
 * Chrome, driven by real CDP through the real browser-use engine, navigating
 * to a page this test serves itself (loopback only — no external network
 * dependency, no flaky live-internet assertions).
 *
 * Honestly environment-gated, not silently skipped: this needs Python 3 with
 * `browser_use` installed and a real Chromium-family browser, which the
 * default CI runner doesn't have (see this capability's README). The suite
 * detects that up front and skips with a clear reason rather than failing
 * opaquely or being quietly absent.
 *
 * Configure via env vars for a non-default setup:
 *   OPTIMUS_TEST_PYTHON      python executable with browser_use installed
 *   OPTIMUS_TEST_CHROME_PATH path to a Chrome/Chromium binary
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Broker } from "../../../kernel/broker";
import { Harness } from "../../../kernel/harness";
import { MemoryArtifactStore } from "../../../kernel/artifacts";
import type { Capability, CheckContext } from "../../../kernel/types";
import {
  browserNavigate,
  browserNavigateSucceeded,
  type BrowserNavigateOutput,
} from "../../../kernel/capabilities/browser-use/navigate";

const PYTHON = process.env.OPTIMUS_TEST_PYTHON ?? "python3";
const DEFAULT_MAC_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_PATH = process.env.OPTIMUS_TEST_CHROME_PATH ?? DEFAULT_MAC_CHROME;

function detectEnvironment(): { ready: boolean; reason: string } {
  if (!existsSync(CHROME_PATH)) {
    return { ready: false, reason: `no Chrome binary at ${CHROME_PATH}` };
  }
  const check = spawnSync(PYTHON, ["-c", "import browser_use"], { encoding: "utf8" });
  if (check.status !== 0) {
    return {
      ready: false,
      reason: `'${PYTHON} -c "import browser_use"' failed — run pip install -r kernel/capabilities/browser-use/requirements.txt`,
    };
  }
  return { ready: true, reason: "" };
}

const environment = detectEnvironment();

describe.skipIf(!environment.ready)(
  `browser.navigate — real Chrome via browser-use ${environment.ready ? "" : `(SKIPPED: ${environment.reason})`}`,
  () => {
    let server: Server;
    let fixtureUrl: string;

    const FIXTURE_HTML = `<!doctype html>
<html><head><title>OPTIMUS bridge fixture</title></head>
<body><h1>Product Listing</h1>
<div id="product" class="card"><span class="price" id="pr-1">$42.00</span></div>
</body></html>`;

    beforeAll(async () => {
      server = createServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(FIXTURE_HTML);
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address() as AddressInfo;
      fixtureUrl = `http://127.0.0.1:${port}/fixture.html`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    function buildKernel() {
      const broker = new Broker();
      broker.register(browserNavigate);
      broker.registerCheck(browserNavigateSucceeded);
      const harness = new Harness({ broker, store: new MemoryArtifactStore() });
      return harness;
    }

    it(
      "drives a real browser to a real page and returns the actual rendered content",
      async () => {
        const harness = buildKernel();

        const outcome = await harness.runStep({
          id: "navigate-fixture",
          capabilityId: "browser.navigate",
          input: { url: fixtureUrl, chromeExecutablePath: CHROME_PATH, pythonExecutable: PYTHON },
          dependsOn: [],
          checks: ["browser.navigateSucceeded"],
        });

        expect(outcome.status, JSON.stringify(outcome.evidence, null, 2)).toBe("passed");

        const output = outcome.output as BrowserNavigateOutput;
        expect(output.ok).toBe(true);
        // This is the actual, rendered page text — proves the request went
        // through real Chrome and real CDP, not a stub.
        expect(output.text).toContain("Product Listing");
        expect(output.text).toContain("$42.00");
        // The real <title>, asserted for real.
        //
        // This used to be `expect(typeof output.title).toBe("string")`, with a
        // careful comment explaining that get_current_page_title() returns the
        // URL and calling it "real upstream nuance, not a bug in this
        // capability." The diagnosis was right and the conclusion was wrong:
        // this capability's own contract promises `title` means a page title,
        // so shipping a URL there is OUR defect regardless of whose code
        // produces it. A type-only assertion passes on any string — including
        // the wrong one — which is how it survived gate 11 since absorption.
        // bridge.py now reads document.title over CDP Runtime.evaluate.
        expect(output.title).toBe("OPTIMUS bridge fixture");

        // Evidence carries a real artifact, same as every other capability.
        expect(outcome.evidence.artifactIds).toHaveLength(1);
      },
      30_000,
    );

    it(
      "the permission boundary applies: proc:spawn is refused without it",
      async () => {
        const broker = new Broker();
        broker.register({
          manifest: { ...browserNavigate.manifest, id: "browser.navigate.unprivileged", permissions: [] },
          run: browserNavigate.run,
        });
        const harness = new Harness({ broker, store: new MemoryArtifactStore() });

        const outcome = await harness.runStep({
          id: "unprivileged",
          capabilityId: "browser.navigate.unprivileged",
          input: { url: fixtureUrl, chromeExecutablePath: CHROME_PATH, pythonExecutable: PYTHON },
          dependsOn: [],
          checks: [],
        });

        expect(outcome.status).not.toBe("passed");
        expect(outcome.evidence.checks[0].reason).toMatch(/permission denied/i);
        expect(outcome.evidence.checks[0].reason).toMatch(/proc:spawn/);
      },
      10_000,
    );

    it(
      "reports a check failure, not a crash, when navigation targets an unreachable host",
      async () => {
        const harness = buildKernel();

        const outcome = await harness.runStep({
          id: "unreachable",
          capabilityId: "browser.navigate",
          input: {
            // Reserved-for-documentation TLD — guaranteed to fail DNS, never
            // flaky, never a real external dependency.
            url: "http://this-domain-does-not-exist.invalid/",
            chromeExecutablePath: CHROME_PATH,
            pythonExecutable: PYTHON,
          },
          dependsOn: [],
          checks: ["browser.navigateSucceeded"],
        });

        expect(outcome.status).not.toBe("passed");
        expect(outcome.evidence.checks[0].passed).toBe(false);
      },
      30_000,
    );
  },
);

/**
 * Isolates browser.navigateSucceeded's own guard logic from real navigation
 * timing and the harness's generic "check threw" safety net — neither of
 * which reliably discriminates a real end-to-end run (a genuinely successful
 * navigation legitimately passes either way; a genuinely failed one can trip
 * the harness's exception fallback instead of the check's own logic,
 * observed while mutation-testing this file). No Chrome or Python needed —
 * runs in every CI environment.
 */
describe("browser.navigateSucceeded — check logic, isolated from real navigation", () => {
  function checkOnly() {
    const broker = new Broker();
    broker.registerCheck(browserNavigateSucceeded);
    return broker;
  }

  async function runFakeCapability(fakeOutput: unknown) {
    const broker = checkOnly();
    const fake: Capability = {
      manifest: {
        ...browserNavigate.manifest,
        id: "browser.navigate.fake",
        // A stub that ignores input entirely, so it declares the honest
        // contract for THAT — not the real capability's. Inheriting the
        // real one would make this fake fail at the manifest door and
        // never reach the check these tests exist to exercise.
        inputConstraints: {},
        // The same reasoning at the OUTPUT door (#66). The stub never stores
        // an artifact, so it does not promise an `artifactId`; every other
        // field is the real manifest's. Loosened by exactly one field, so a
        // canned output that is genuinely the wrong SHAPE still fails here
        // rather than reaching the check under false pretenses.
        outputs: {
          ok: { kind: "boolean", required: true },
          url: { kind: "string" },
          title: { kind: "string" },
          text: { kind: "string" },
          error: { kind: "string" },
          artifactId: { kind: "string" },
        },
      },
      async run() {
        return fakeOutput;
      },
    };
    broker.register(fake);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    return harness.runStep({
      id: "fake",
      capabilityId: "browser.navigate.fake",
      input: {},
      dependsOn: [],
      checks: ["browser.navigateSucceeded"],
    });
  }

  it("fails a result claiming ok=true with empty text", async () => {
    const outcome = await runFakeCapability({ ok: true, url: "x", title: "x", text: "" });
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/no page text/);
  });

  it("fails a result reporting ok=false, even if text happens to be present", async () => {
    const outcome = await runFakeCapability({ ok: false, error: "boom", text: "leftover text" });
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/did not succeed/);
  });

  it("passes a result that genuinely has ok=true and non-empty text", async () => {
    const outcome = await runFakeCapability({ ok: true, url: "x", title: "x", text: "real content" });
    expect(outcome.status).toBe("passed");
  });

  /**
   * Malformed output used to be one test through the harness. It is two now,
   * because #66 gave the harness an output door and the single test would have
   * gone on passing for a reason that had nothing to do with the check —
   * exactly the drift AC-3 records twice. Both halves are real guarantees and
   * they belong to different subjects, so they are asserted separately.
   */
  it("the OUTPUT DOOR refuses a capability that returns nothing at all", async () => {
    const outcome = await runFakeCapability(undefined);
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks.map((c) => c.checkId)).toEqual(["capability.completed"]);
    expect(outcome.evidence.checks[0].reason).toMatch(/output does not match its declared outputs/);
  });

  it("the CHECK itself fails malformed output instead of crashing", async () => {
    // Called directly: the harness can no longer deliver a malformed value to
    // a check, but `Check.run` still takes `unknown` and every check must
    // survive one. A check that throws on a shape it did not expect turns a
    // verdict into a crash.
    const result = await browserNavigateSucceeded.run(undefined, {} as CheckContext);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/did not succeed/);
  });
});

describe("environment detection self-check", () => {
  it("reports what it decided, so a skip has a visible reason in CI output", () => {
    console.log(
      environment.ready
        ? "browser-use environment READY — real-Chrome tests will run"
        : `browser-use environment NOT ready — SKIPPING (${environment.reason})`,
    );
    expect(typeof environment.ready).toBe("boolean");
  });
});
