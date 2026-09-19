/**
 * The gate's own tests. It is a setup file, so it is ALREADY ACTIVE while
 * these run — which is the only honest way to test it: these assertions
 * exercise the live guard, not a re-import of its logic.
 */
import { describe, it, expect } from "vitest";

describe("no-real-network — the seam is enforced, not assumed", () => {
  it("refuses an external host, and the message says how to fix it", () => {
    expect(() => fetch("https://api.github.com/repos/octocat/Hello-World")).toThrow(
      /reached the real network: https:\/\/api\.github\.com/,
    );
    // The message must TEACH — the reader is mid-debug on a test that passed
    // a minute ago. A bare "blocked" would send them to disable the gate.
    expect(() => fetch("https://example.com")).toThrow(/new Broker\(\{ netFetch \}\)/);
    expect(() => fetch("https://example.com")).toThrow(/OPTIMUS_ALLOW_REAL_NETWORK=1/);
  });

  it("lets loopback through — a server the test started is not the network", async () => {
    // Port 1 with nothing on it. The distinction being asserted is WHICH error
    // arrives: a connection failure means the request passed the guard and
    // reached the socket layer. If the guard had refused it, the message would
    // be the guard's instead, and this test would fail.
    await expect(fetch("http://127.0.0.1:1/")).rejects.toThrow(/fetch failed|ECONNREFUSED/);
    await expect(fetch("http://localhost:1/")).rejects.toThrow(/fetch failed|ECONNREFUSED/);
  });

  it("fails closed on a URL it cannot parse", () => {
    // Not demonstrably local, so refused. A guard that waves through what it
    // cannot understand is a guard with an undocumented bypass.
    expect(() => fetch("not a url")).toThrow(/reached the real network/);
  });

  it("does not decide by DNS — a hostname that resolves to loopback is still refused", () => {
    // `localtest.me` resolves to 127.0.0.1 in the real world. Allowing it
    // would mean a DNS lookup to decide whether a network call is permitted,
    // which is itself a network call, and the answer would depend on a
    // resolver this project does not control.
    expect(() => fetch("http://localtest.me/")).toThrow(/reached the real network/);
  });
});
