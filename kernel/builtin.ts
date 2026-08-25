/**
 * The first registered capabilities and checks — WP-001's "exactly 1 tool"
 * grown to the smallest set that exercises a real multi-step graph.
 *
 * These are deliberately boring. The pipe is the deliverable, not the tool.
 */

import type { Capability, Check, CheckResult } from "./types";

const ONE_SECOND = 1000;

/**
 * `web.fetch` — reads a URL through the permission boundary and stores the
 * body as a content-addressed artifact. Declares net:read and NOTHING else,
 * so a bug in it cannot touch the filesystem (AC-2).
 */
export const webFetch: Capability = {
  manifest: {
    id: "web.fetch",
    version: "1.0.0",
    permissions: ["net:read"],
    // netRead runs IN-PROCESS here, so the boundary can and does police it:
    // a named host, not a blanket excuse. The injected fetcher (HarnessDeps
    // .fetcher) never sees a URL this list rejects.
    isolation: { allowedHosts: ["example.com"] },
    inputConstraints: {
      // Same host list as isolation.allowedHosts above, checked one layer
      // earlier: this refuses the value, that refuses the socket.
      url: { kind: "url", required: true, allowedSchemes: ["http", "https"], allowedHosts: ["example.com"] },
    },
    defaultBudget: { maxAttempts: 3, maxWallTimeMs: 30 * ONE_SECOND, maxCost: 10 },
    description: "Fetch a URL and store the response body as an artifact.",
  },
  async run(input, ctx) {
    const { url } = input as { url: string };
    if (typeof url !== "string" || url.length === 0) {
      throw new Error("web.fetch requires { url: string }");
    }
    const body = await ctx.netRead(url);
    const artifactId = await ctx.putArtifact(body);
    return { artifactId, bytes: body.length };
  },
};

/**
 * `html.extractTitle` — pure transformation over an artifact. Needs no
 * permissions at all: it reads through the artifact store, not the world.
 */
export const htmlExtractTitle: Capability = {
  manifest: {
    id: "html.extractTitle",
    version: "1.0.0",
    permissions: [],
    inputConstraints: {
      // A content address, and shaped like one: `sha256:` + 64 hex is 71
      // characters exactly, so the bounds are the real format, not a guess.
      artifactId: { kind: "string", required: true, minLength: 71, maxLength: 71 },
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: 5 * ONE_SECOND, maxCost: 5 },
    description: "Extract the <title> text from a stored HTML artifact.",
  },
  async run(input, ctx) {
    const { artifactId } = input as { artifactId: string };
    if (typeof artifactId !== "string") {
      throw new Error("html.extractTitle requires { artifactId: string }");
    }
    const html = await ctx.readArtifact(artifactId);
    const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (!match) throw new Error("no <title> element found");
    const title = match[1].trim().replace(/\s+/g, " ");
    const titleArtifact = await ctx.putArtifact(title);
    return { title, artifactId: titleArtifact };
  },
};

/* ── checks ──────────────────────────────────────────────────────────────
   A check must be able to FAIL, and must say why. These are the whole
   reason a step can be called done.                                       */

export const titleNonEmpty: Check = {
  id: "title.nonEmpty",
  async run(output): Promise<CheckResult> {
    const title = (output as { title?: unknown })?.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      return {
        checkId: "title.nonEmpty",
        passed: false,
        reason: `expected a non-empty title, got ${JSON.stringify(title)}`,
      };
    }
    return {
      checkId: "title.nonEmpty",
      passed: true,
      reason: `title is ${title.length} chars`,
      detail: { title },
    };
  },
};

/** Proves the artifact the step claims to have written actually exists. */
export const artifactExists: Check = {
  id: "artifact.exists",
  async run(output, ctx): Promise<CheckResult> {
    const id = (output as { artifactId?: unknown })?.artifactId;
    if (typeof id !== "string") {
      return {
        checkId: "artifact.exists",
        passed: false,
        reason: `step returned no artifactId (got ${JSON.stringify(id)})`,
      };
    }
    try {
      const bytes = await ctx.readArtifact(id);
      return {
        checkId: "artifact.exists",
        passed: true,
        reason: `artifact ${id} readable, ${bytes.length} bytes`,
        detail: { artifactId: id, bytes: bytes.length },
      };
    } catch (error) {
      return {
        checkId: "artifact.exists",
        passed: false,
        reason: `artifact ${id} is not readable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  },
};

/**
 * Factory: assert the produced content hashes to an expected value. This is
 * the fidelity-style check — it is what makes AC-1 and AC-7 falsifiable.
 */
export function expectArtifact(expectedId: string): Check {
  return {
    id: `artifact.equals:${expectedId}`,
    async run(output): Promise<CheckResult> {
      const id = (output as { artifactId?: unknown })?.artifactId;
      const passed = id === expectedId;
      return {
        checkId: `artifact.equals:${expectedId}`,
        passed,
        reason: passed
          ? `artifact matches expected hash`
          : `expected ${expectedId}, got ${JSON.stringify(id)}`,
        detail: { expected: expectedId, actual: id },
      };
    },
  };
}
