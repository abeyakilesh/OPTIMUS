import { describe, it, expect } from "vitest";
import { Broker } from "../../kernel/broker";
import { Harness } from "../../kernel/harness";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import { githubResolve, repoResolved } from "../../kernel/github";
import { artifactIntact } from "../../kernel/builtin";
import type { NetFetchRequest, NetFetchResult } from "../../kernel/types";

/**
 * #84, step 1 — resolve a repo to the commit that actually exists.
 *
 * VERIFIED AGAINST THE LIVE API BEFORE THESE TESTS WERE WRITTEN, and then
 * cross-checked against a completely different protocol:
 *
 *   github.resolve  honojs/hono    -> eebdf7be39ab
 *   git ls-remote   honojs/hono    -> eebdf7be39ab
 *   github.resolve  prisma/prisma  -> dd846dcc8f06
 *   git ls-remote   prisma/prisma  -> dd846dcc8f06
 *
 * That matters more than any assertion below: the SHA is the reference the
 * whole acceptance mission rests on, so it was confirmed by a source that
 * shares no code with this one. The tests here are hermetic — CI must not
 * depend on GitHub being up, or on a rate limit nobody controls.
 */

const SHA = "a".repeat(40);

/** A fake API that records what it was asked, so the requests can be asserted. */
function fakeGithub(
  responses: Record<string, Partial<NetFetchResult>>,
): { fetch: (r: NetFetchRequest) => Promise<NetFetchResult>; seen: NetFetchRequest[] } {
  const seen: NetFetchRequest[] = [];
  return {
    seen,
    async fetch(request) {
      seen.push(request);
      for (const [fragment, res] of Object.entries(responses)) {
        if (request.url.includes(fragment)) {
          return { status: 200, headers: {}, body: "", timedOut: false, ...res };
        }
      }
      return { status: 404, headers: {}, body: "{}", timedOut: false };
    },
  };
}

function kernel(api: ReturnType<typeof fakeGithub>) {
  const broker = new Broker();
  broker.register(githubResolve);
  broker.registerCheck(repoResolved);
  broker.registerCheck(artifactIntact);
  const harness = new Harness({
    broker,
    store: new MemoryArtifactStore(),
    // Hermetic. Before `netFetcher` existed these tests silently reached the
    // real GitHub — the first run returned hono's actual SHA instead of the
    // fixture's, which is how the gap was found.
    netFetcher: api.fetch,
  });
  return { broker, harness };
}

// ORDER MATTERS: the commits URL is `/repos/honojs/hono/commits/<branch>`, so
// it CONTAINS the metadata fragment. Matching is first-wins, so the more
// specific fragment is listed first — otherwise the commit call is answered
// with the metadata body and the step fails on "no usable commit sha".
const OK = (branch = "main") => ({
  [`/commits/`]: { body: JSON.stringify({ sha: SHA }) },
  [`/repos/honojs/hono`]: { body: JSON.stringify({ default_branch: branch }) },
});

const step = (repo: string, checks = ["repo.resolved"]) => ({
  id: "resolve",
  capabilityId: "github.resolve",
  input: { repo },
  dependsOn: [],
  checks,
});

/* ══ the contract ══════════════════════════════════════════════════════════ */

describe("github.resolve is bounded and reads only", () => {
  it("reaches api.github.com and nothing else", () => {
    expect(githubResolve.manifest.isolation?.allowedHosts).toEqual(["api.github.com"]);
    expect(githubResolve.manifest.permissions).toEqual(["net:read"]);
  });

  it("has NO input field for a credential", () => {
    // Step input is written by a plan compiler driven by a model. A token
    // field would be a secret a model could choose. The environment is the
    // operator; there is deliberately no path from input to Authorization.
    const fields = Object.keys(githubResolve.manifest.inputConstraints);
    expect(fields).toEqual(["repo"]);
    expect(JSON.stringify(fields)).not.toMatch(/token|auth|key|secret/i);
  });

  it("declares everything GitHub said as UNTRUSTED, including the sha", () => {
    // Not a contradiction with using the sha as the verification reference.
    // `untrusted` means "came from outside, treat as data" — and the sha's
    // authority comes precisely from OPTIMUS not having authored it.
    // Labelling it `capability` would claim we computed it.
    const t = githubResolve.manifest.outputTrust;
    expect(t.sha).toBe("untrusted");
    expect(t.defaultBranch).toBe("untrusted");
    expect(t.tarballUrl).toBe("untrusted");
    // `repo` is echoed back from OUR input, so it is ours.
    expect(t.repo).toBe("capability");
  });
});

/* ══ resolving ═════════════════════════════════════════════════════════════ */

describe("resolving a repo", () => {
  it("returns the branch and the HEAD commit, and seals them", async () => {
    const api = fakeGithub(OK());
    const { harness } = kernel(api);
    const out = await harness.runStep(step("honojs/hono", ["repo.resolved", "artifact.intact"]));
    expect(out.status, JSON.stringify(out.evidence.checks)).toBe("passed");
    const o = out.evidence as unknown as { checks: Array<{ detail?: Record<string, unknown> }> };
    expect(o.checks[0].detail?.sha).toBe(SHA);
  });

  it("asks the commit endpoint for the branch the repo DECLARED, not a guess", async () => {
    // Guessing "main" is how a resolver silently answers about the wrong
    // branch on a repo that still uses master. Asserted on the real request.
    const api = fakeGithub(OK("master"));
    const { harness } = kernel(api);
    await harness.runStep(step("honojs/hono"));
    const commitCall = api.seen.find((r) => r.url.includes("/commits/"));
    expect(commitCall?.url).toContain("/commits/master");
    expect(commitCall?.url).not.toContain("/commits/main");
  });

  it("sends a User-Agent, which the API requires", async () => {
    const api = fakeGithub(OK());
    const { harness } = kernel(api);
    await harness.runStep(step("honojs/hono"));
    expect(api.seen[0].headers?.["User-Agent"]).toBeTruthy();
  });

  it("refuses an input that is not owner/repo", async () => {
    const api = fakeGithub(OK());
    const { harness } = kernel(api);
    const out = await harness.runStep(step("not-a-repo"));
    expect(out.status).not.toBe("passed");
  });
});

/* ══ failures that must say WHICH failure ══════════════════════════════════ */

describe("a failure names its own repair", () => {
  it("404 says the repo does not exist", async () => {
    const api = fakeGithub({ "/repos/": { status: 404, body: "{}" } });
    const { harness } = kernel(api);
    const out = await harness.runStep(step("honojs/hono"));
    expect(JSON.stringify(out.evidence.checks)).toMatch(/does not exist \(404\)/);
  });

  it("403 says RATE LIMIT and whether a token was present", async () => {
    // The repair for this differs entirely from every other failure: it is
    // fixed by a credential, not by retrying. A generic "HTTP 403" would send
    // a repair loop the wrong way — 244 repos will hit the 60/hour limit.
    const api = fakeGithub({ "/repos/": { status: 403, body: "{}" } });
    const { harness } = kernel(api);
    const out = await harness.runStep(step("honojs/hono"));
    const text = JSON.stringify(out.evidence.checks);
    expect(text).toMatch(/rate-limited/);
    expect(text).toMatch(/GITHUB_TOKEN|Token present/);
  });

  it("refuses a body with no usable sha rather than inventing one", async () => {
    const api = fakeGithub({
      "/commits/": { body: JSON.stringify({ sha: "not-a-sha" }) },
      "/repos/honojs/hono": { body: JSON.stringify({ default_branch: "main" }) },
    });
    const { harness } = kernel(api);
    const out = await harness.runStep(step("honojs/hono"));
    expect(JSON.stringify(out.evidence.checks)).toMatch(/no usable commit sha/);
  });
});

/* ══ the check asserts INTENT, not shape ═══════════════════════════════════ */

describe("repo.resolved asserts the answer is about the repo that was ASKED for", () => {
  const run = (o: unknown) => repoResolved.run(o, { readArtifact: async () => "" });

  const good = {
    repo: "honojs/hono",
    defaultBranch: "main",
    sha: SHA,
    tarballUrl: `https://api.github.com/repos/honojs/hono/tarball/${SHA}`,
  };

  it("passes a coherent answer", async () => {
    const r = await run(good);
    expect(r.passed, r.reason).toBe(true);
  });

  it("FAILS a well-formed answer about the WRONG repo", async () => {
    // The failure this check exists for. Every shape check passes; the tarball
    // points at a different project. Downstream, the download would fetch that
    // project and repo.intact would confirm the bytes matched the sha it was
    // handed — a fully green mission that fetched the wrong thing.
    const r = await run({ ...good, tarballUrl: `https://api.github.com/repos/evil/other/tarball/${SHA}` });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/not for honojs\/hono/);
  });

  it("FAILS when the tarball points at a different commit than reported", async () => {
    const r = await run({ ...good, tarballUrl: `https://api.github.com/repos/honojs/hono/tarball/${"b".repeat(40)}` });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/does not point at the resolved commit/);
  });

  it("FAILS a sha that is not a 40-hex commit id", async () => {
    const r = await run({ ...good, sha: "abc" });
    expect(r.passed).toBe(false);
    expect(r.reason).toMatch(/not a 40-hex/);
  });

  it("is reasoned, not observed — it inspects values, it did not fetch anything", async () => {
    const r = await run(good);
    expect(r.verification).toBe("reasoned");
  });
});
