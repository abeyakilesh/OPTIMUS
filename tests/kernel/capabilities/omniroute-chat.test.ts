/**
 * Real end-to-end proof for kernel/capabilities/omniroute/: a genuine
 * OmniRoute server, routing a genuine chat completion request to a real
 * local model (verified against Ollama's llama3.2:3b during development —
 * zero API key, zero internet), through OmniRoute's own router/failover
 * engine, never a mock.
 *
 * Honestly environment-gated, not silently skipped: this needs an OmniRoute
 * instance already running with at least one provider connection configured
 * (see this capability's README for the exact two-HTTP-call setup). The
 * default CI runner has neither, so the suite detects that up front and
 * skips with a clear reason rather than failing opaquely.
 *
 * Configure via env vars for a non-default setup:
 *   OPTIMUS_TEST_OMNIROUTE_BASE_URL   default http://127.0.0.1:20128
 *   OPTIMUS_TEST_OMNIROUTE_MODEL      default ollama/llama3.2:latest
 */

import { describe, it, expect } from "vitest";

import { Broker } from "../../../kernel/broker";
import { Harness } from "../../../kernel/harness";
import { MemoryArtifactStore } from "../../../kernel/artifacts";
import type { Capability } from "../../../kernel/types";
import { llmChat, llmChatSucceeded, type LlmChatOutput } from "../../../kernel/capabilities/omniroute/chat";

const BASE_URL = process.env.OPTIMUS_TEST_OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128";
const MODEL = process.env.OPTIMUS_TEST_OMNIROUTE_MODEL ?? "ollama/llama3.2:latest";

async function detectEnvironment(): Promise<{ ready: boolean; reason: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/health/ping`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { ready: false, reason: `${BASE_URL}/api/health/ping returned ${res.status}` };
    return { ready: true, reason: "" };
  } catch (error) {
    return {
      ready: false,
      reason: `no OmniRoute instance reachable at ${BASE_URL} — see kernel/capabilities/omniroute/README.md to start one (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

const environment = await detectEnvironment();

describe.skipIf(!environment.ready)(
  `llm.chat — real OmniRoute instance ${environment.ready ? "" : `(SKIPPED: ${environment.reason})`}`,
  () => {
    function buildKernel() {
      const broker = new Broker();
      broker.register(llmChat);
      broker.registerCheck(llmChatSucceeded);
      const harness = new Harness({ broker, store: new MemoryArtifactStore() });
      return harness;
    }

    it(
      "sends a real chat message and gets a real model reply, routed through OmniRoute",
      async () => {
        const harness = buildKernel();

        const outcome = await harness.runStep({
          id: "chat-smoke",
          capabilityId: "llm.chat",
          input: {
            baseUrl: BASE_URL,
            model: MODEL,
            messages: [{ role: "user", content: "Reply with a short greeting." }],
          },
          dependsOn: [],
          checks: ["llm.chatSucceeded"],
        });

        expect(outcome.status, JSON.stringify(outcome.evidence, null, 2)).toBe("passed");

        const output = outcome.output as LlmChatOutput;
        expect(output.ok).toBe(true);
        // Real model output is nondeterministic — assert presence/shape, not
        // exact wording (same discipline as browser.navigate's title check).
        expect(output.content?.trim().length ?? 0).toBeGreaterThan(0);
        expect(output.usage?.totalTokens ?? 0).toBeGreaterThan(0);
        expect(outcome.evidence.artifactIds).toHaveLength(1);
      },
      90_000,
    );

    it(
      "the permission boundary applies: net:write is refused without it",
      async () => {
        const broker = new Broker();
        broker.register({
          manifest: { ...llmChat.manifest, id: "llm.chat.unprivileged", permissions: [] },
          run: llmChat.run,
        });
        const harness = new Harness({ broker, store: new MemoryArtifactStore() });

        const outcome = await harness.runStep({
          id: "unprivileged",
          capabilityId: "llm.chat.unprivileged",
          input: { baseUrl: BASE_URL, model: MODEL, messages: [{ role: "user", content: "hi" }] },
          dependsOn: [],
          checks: [],
        });

        expect(outcome.status).not.toBe("passed");
        expect(outcome.evidence.checks[0].reason).toMatch(/permission denied/i);
        expect(outcome.evidence.checks[0].reason).toMatch(/net:write/);
      },
      10_000,
    );

    it(
      "reports a check failure, not a crash, when the model can't be routed",
      async () => {
        const harness = buildKernel();

        const outcome = await harness.runStep({
          id: "unroutable",
          capabilityId: "llm.chat",
          input: {
            baseUrl: BASE_URL,
            model: "optimus-test-nonexistent-provider/does-not-exist",
            messages: [{ role: "user", content: "hi" }],
          },
          dependsOn: [],
          checks: ["llm.chatSucceeded"],
        });

        expect(outcome.status).not.toBe("passed");
        expect(outcome.evidence.checks[0].passed).toBe(false);
      },
      20_000,
    );
  },
);

/**
 * Isolates llm.chatSucceeded's own guard logic from real network timing and
 * the harness's generic "check threw" safety net — same reasoning as
 * browser.navigateSucceeded's isolated block: a mutation to one guard can
 * hide behind the other guard, or behind the harness's own exception
 * fallback, when only tested through a real end-to-end run. No network
 * needed — runs in every CI environment.
 */
describe("llm.chatSucceeded — check logic, isolated from real network calls", () => {
  function checkOnly() {
    const broker = new Broker();
    broker.registerCheck(llmChatSucceeded);
    return broker;
  }

  async function runFakeCapability(fakeOutput: unknown) {
    const broker = checkOnly();
    const fake: Capability = {
      manifest: {
        ...llmChat.manifest,
        id: "llm.chat.fake",
        // A stub that ignores input entirely, so it declares the honest
        // contract for THAT — not the real capability's. Inheriting the
        // real one would make this fake fail at the manifest door and
        // never reach the check these tests exist to exercise.
        inputConstraints: {},
      },
      async run() {
        return fakeOutput;
      },
    };
    broker.register(fake);
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    return harness.runStep({
      id: "fake",
      capabilityId: "llm.chat.fake",
      input: {},
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });
  }

  it("fails a result claiming ok=true with empty content", async () => {
    const outcome = await runFakeCapability({ ok: true, status: 200, content: "" });
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/no content/);
  });

  it("fails a result reporting ok=false, even if content happens to be present", async () => {
    const outcome = await runFakeCapability({ ok: false, status: 404, error: "boom", content: "leftover" });
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/did not succeed/);
  });

  it("passes a result that genuinely has ok=true and non-empty content", async () => {
    const outcome = await runFakeCapability({ ok: true, status: 200, model: "x", content: "real reply" });
    expect(outcome.status).toBe("passed");
  });

  it("fails malformed output instead of crashing", async () => {
    const outcome = await runFakeCapability(undefined);
    expect(outcome.status).not.toBe("passed");
    expect(outcome.evidence.checks[0].reason).toMatch(/did not succeed/);
  });
});

describe("environment detection self-check", () => {
  it("reports what it decided, so a skip has a visible reason in CI output", () => {
    console.log(
      environment.ready
        ? "OmniRoute environment READY — real-server tests will run"
        : `OmniRoute environment NOT ready — SKIPPING (${environment.reason})`,
    );
    expect(typeof environment.ready).toBe("boolean");
  });
});
