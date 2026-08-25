import { describe, it, expect } from "vitest";
import { sendMission, loadMission, CLIENT_BUDGET_MS } from "../../lib/missions/client";

const MESSAGES = [{ role: "user" as const, content: "hi" }];

/** A fake fetch returning one canned HTTP response, body given as raw text. */
function respondWith(status: number, body: string, contentType = "application/json"): typeof fetch {
  return (async () =>
    new Response(body, { status, headers: { "Content-Type": contentType } })) as unknown as typeof fetch;
}

/** A fake fetch that fails at the transport layer, like a dead server would. */
function throwWith(error: Error): typeof fetch {
  return (async () => {
    throw error;
  }) as unknown as typeof fetch;
}

/** A fake fetch that never answers, so the client's own budget has to end it. */
function neverAnswers(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as unknown as typeof fetch;
}

describe("sendMission — failure classification", () => {
  /**
   * The exact failure a user actually hit. It used to surface as
   * "model layer unavailable — Failed to execute 'json' on 'Response':
   * Unexpected end of JSON input", blaming a component that was never even
   * reached. Directive #4: the message must name the boundary that broke.
   */
  it("names an empty response body for what it is, and does NOT blame the model layer", async () => {
    const result = await sendMission(MESSAGES, { fetchImpl: respondWith(200, "") });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("malformed");
    expect(result.failure.label).toBe("unexpected response from OPTIMUS");
    expect(result.failure.label).not.toBe("model layer unavailable");
    expect(result.failure.detail).toContain("empty body");
    expect(result.failure.detail).toContain("200");
  });

  it("keeps a non-JSON body as evidence instead of collapsing it into a parse error", async () => {
    const html = "<!DOCTYPE html><html><body>Internal Server Error</body></html>";
    const result = await sendMission(MESSAGES, { fetchImpl: respondWith(500, html, "text/html") });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("malformed");
    expect(result.failure.detail).toContain("not JSON");
    expect(result.failure.detail).toContain("Internal Server Error");
  });

  it("reports an unreachable server as unreachable, not as a model failure", async () => {
    const result = await sendMission(MESSAGES, { fetchImpl: throwWith(new TypeError("Failed to fetch")) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("unreachable");
    expect(result.failure.label).toBe("can't reach OPTIMUS");
    expect(result.failure.detail).toBe("Failed to fetch");
  });

  it("ends its own loop when nothing answers — a real client-side budget", async () => {
    const started = Date.now();
    const result = await sendMission(MESSAGES, { fetchImpl: neverAnswers(), timeoutMs: 50 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("timed-out");
    expect(result.failure.detail).toContain("50ms");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("waits longer than the server's own budget, so the server's verdict wins the race", () => {
    // llm.chat: maxAttempts 2 × a 60s netFetch ≈ 120s worst case. A client
    // that gave up first would mask a real, honest server answer with a guess.
    expect(CLIENT_BUDGET_MS).toBeGreaterThan(2 * 60_000);
  });

  it("treats 401 as a lost session, not as anything to do with the model", async () => {
    const result = await sendMission(MESSAGES, {
      fetchImpl: respondWith(401, JSON.stringify({ ok: false, reason: "authentication required" })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("signed-out");
  });

  it("treats a 400 contract rejection as a rejected request, not a model failure", async () => {
    const result = await sendMission(MESSAGES, {
      fetchImpl: respondWith(400, JSON.stringify({ ok: false, reason: "requires { messages }" })),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("rejected");
    expect(result.failure.detail).toBe("requires { messages }");
  });

  it("DOES blame the model layer when the server honestly says the mission failed", async () => {
    const body = JSON.stringify({
      ok: false,
      missionId: "m-1",
      status: "red",
      reason: "request exceeded 60000ms",
      steps: [{ id: "chat", capabilityId: "llm.chat", status: "finished", checks: [] }],
    });
    const result = await sendMission(MESSAGES, { fetchImpl: respondWith(503, body) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("model-layer");
    expect(result.failure.label).toBe("model layer unavailable");
    expect(result.failure.detail).toBe("request exceeded 60000ms");
    // A red mission is still a REAL mission — its id and evidence survive so
    // the sidebar can show it honestly instead of throwing it away.
    expect(result.failure.missionId).toBe("m-1");
    expect(result.failure.steps).toHaveLength(1);
  });

  it("refuses to render a confident empty bubble when green checks have no recoverable reply", async () => {
    const body = JSON.stringify({ ok: true, missionId: "m-2", status: "green", steps: [] });
    const result = await sendMission(MESSAGES, { fetchImpl: respondWith(200, body) });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("malformed");
    expect(result.failure.detail).toContain("reply text could not be recovered");
    expect(result.failure.missionId).toBe("m-2");
  });

  it("returns the real reply and evidence on success", async () => {
    const body = JSON.stringify({
      ok: true,
      missionId: "m-3",
      status: "green",
      content: "How can I help you today?",
      steps: [
        {
          id: "chat",
          capabilityId: "llm.chat",
          status: "finished",
          durationMs: 13_614,
          checks: [{ checkId: "llm.chatSucceeded", passed: true, reason: "replied with 25 chars" }],
        },
      ],
    });
    const result = await sendMission(MESSAGES, { fetchImpl: respondWith(200, body) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.missionId).toBe("m-3");
    expect(result.content).toBe("How can I help you today?");
    expect(result.steps[0].checks[0].checkId).toBe("llm.chatSucceeded");
  });
});

describe("loadMission — failure classification", () => {
  it("distinguishes a missing mission from a broken transport", async () => {
    const missing = await loadMission("gone", {
      fetchImpl: respondWith(404, JSON.stringify({ ok: false, reason: "no such mission" })),
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.failure.kind).toBe("not-found");

    const dead = await loadMission("m-1", { fetchImpl: throwWith(new TypeError("Failed to fetch")) });
    expect(dead.ok).toBe(false);
    if (!dead.ok) expect(dead.failure.kind).toBe("unreachable");
  });

  it("does not throw an unhandled rejection on an empty body — it classifies it", async () => {
    const result = await loadMission("m-1", { fetchImpl: respondWith(200, "") });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("malformed");
  });

  it("returns the persisted mission and its recovered reply", async () => {
    const mission = { spec: { id: "m-1", objective: "hi", steps: [] }, status: "green", steps: {} };
    const result = await loadMission("m-1", {
      fetchImpl: respondWith(200, JSON.stringify({ ok: true, mission, content: "the persisted answer" })),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toBe("the persisted answer");
    expect(result.mission.spec.objective).toBe("hi");
  });
});
