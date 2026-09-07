/**
 * The first registered capabilities and checks — WP-001's "exactly 1 tool"
 * grown to the smallest set that exercises a real multi-step graph.
 *
 * These are deliberately boring. The pipe is the deliverable, not the tool.
 */

import type { Capability, Check, CheckResult } from "./types";
import { ARTIFACT_ID_OUTPUT } from "./outputContract";

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
    // Read off `run()` below, not off the description: it returns the address
    // of the stored body and the body's length, and nothing else. A later
    // step's {"$from": "fetch.title"} is refused against exactly this.
    outputs: {
      artifactId: ARTIFACT_ID_OUTPUT,
      bytes: { kind: "number", required: true, integer: true, min: 0 },
    },
    // THE CAPABILITY THAT REACHES THE INTERNET DECLARES NO UNTRUSTED OUTPUT,
    // and that is correct rather than an oversight worth reading twice.
    // Neither field IS the response: `artifactId` is a SHA-256 this kernel
    // computed over the body, `bytes` is its length. Both are facts OPTIMUS
    // established about the bytes, not the bytes.
    //
    // The body itself is untrusted and it leaves through the artifact store,
    // where no `$from` reference can see it. That is limit #1 in
    // `assertTrustNotLaundered`, stated concretely: whichever capability READS
    // this artifact is the one that must declare its output untrusted —
    // `html.extractTitle` immediately below does exactly that.
    outputTrust: {
      artifactId: "capability",
      bytes: "capability",
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
    // `title` carries no minLength on purpose. The capability legitimately
    // returns "" for `<title></title>`; whether an empty title is ACCEPTABLE
    // is the mission's question, and `title.nonEmpty` is the check that asks
    // it. A contract that refused it here would make the check unreachable and
    // report the wrong reason for the same failure.
    outputs: {
      title: { kind: "string", required: true },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
    // `title` IS UNTRUSTED, and this is the exact case #70 was filed about:
    //
    //   "If html.extractTitle reads an untrusted artifact and returns a title,
    //    that title is untrusted — but the manifest says extract is pure."
    //
    // Both halves are true and they are not in tension. The FUNCTION is pure:
    // no permissions, one regex, same input to same output forever. The VALUE
    // is whatever a web page put between two tags. Purity is a statement about
    // the code, trust is a statement about the bytes, and reading the first as
    // the second is how attacker-authored text acquires a clean label.
    //
    // Trust does not propagate on its own here (see `assertTrustNotLaundered`),
    // so this line IS the propagation — declared by the person who knows where
    // the artifact came from, checked by nobody. Stated plainly because it is
    // the weakest joint in the mechanism.
    //
    // `artifactId` is the address of the title this capability just stored: a
    // hash computed here, like every other content address.
    outputTrust: {
      title: "untrusted",
      artifactId: "capability",
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
  // Reads the string that came back and decides. Nothing was exercised to
  // find out, so this is `reasoned` — the weakest honest label, and the
  // right one. Calling it `observed` would be the overstatement Atlas §14
  // names.
  verification: ["reasoned"],
  // Reads `output.title` and nothing else, so the rule is the FIELD, not a
  // capability list. That broadens it correctly: `browser.navigate` also
  // declares `title`, and asking whether a navigated page had a real title is
  // exactly as meaningful as asking it of an extracted one. The compiler's
  // old stand-in map listed only html.extractTitle and was too narrow.
  appliesTo: { kind: "outputs", requires: ["title"] },
  async run(output): Promise<CheckResult> {
    const title = (output as { title?: unknown })?.title;
    if (typeof title !== "string" || title.trim().length === 0) {
      return {
        checkId: "title.nonEmpty",
        verification: "reasoned",
        passed: false,
        reason: `expected a non-empty title, got ${JSON.stringify(title)}`,
      };
    }
    return {
      checkId: "title.nonEmpty",
      verification: "reasoned",
      passed: true,
      reason: `title is ${title.length} chars`,
      detail: { title },
    };
  },
};

/**
 * Proves the step's artifact is readable AND that its bytes still hash to the
 * id the step reported.
 *
 * RENAMED from `artifact.exists` in #60, because the check now proves strictly
 * more than its old name said. Existence was all it could ever assert while
 * `ArtifactStore.get()` returned bytes unverified; with the store enforcing
 * the invariant on read, a pass here means the content is intact, and evidence
 * reading "artifact.exists ✔" would understate what was established. A name
 * that understates is still a name that has to be checked against behaviour
 * (THE SELF-DESCRIPTION RULE) — the direction of the error is luck, not
 * design.
 *
 * The verification lives in the store, not here. This check must not re-hash
 * independently: a check that re-implements the guarantee it is checking will
 * pass whenever its own copy of the logic agrees with itself, which is how a
 * check stops testing its subject (THE MUTATION RULE).
 */
export const artifactIntact: Check = {
  id: "artifact.intact",
  // `observed`, and the only check in the kernel that earns it today. It
  // reads the bytes back through a store that re-derives the address on
  // read (#61), so the conclusion rests on what the store DID, not on what
  // the capability returned. That is exactly the distinction #63 exists to
  // record — this check and title.nonEmpty rendered identically before.
  verification: ["observed"],
  // The case #71 was filed around: this applies to anything returning an
  // artifactId — five capabilities today. Declared as the FIELD so it cannot
  // go stale; a sixth capability is covered the moment it registers, with
  // nothing to remember and no list to edit.
  appliesTo: { kind: "outputs", requires: ["artifactId"] },
  async run(output, ctx): Promise<CheckResult> {
    const id = (output as { artifactId?: unknown })?.artifactId;
    if (typeof id !== "string") {
      return {
        checkId: "artifact.intact",
        verification: "observed",
        passed: false,
        reason: `step returned no artifactId (got ${JSON.stringify(id)})`,
      };
    }
    try {
      const bytes = await ctx.readArtifact(id);
      return {
        checkId: "artifact.intact",
        verification: "observed",
        passed: true,
        reason: `artifact ${id} readable and intact, ${bytes.length} bytes`,
        detail: { artifactId: id, bytes: bytes.length },
      };
    } catch (error) {
      return {
        checkId: "artifact.intact",
        verification: "observed",
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
    // Compares the returned id to an expected one. A string comparison over
    // a value, not an observation of anything re-derived.
    verification: ["reasoned"],
    // #71 flagged this one specifically: "expectArtifact(id) is a check
    // FACTORY, so its applicability is per-instance." It is not — the id
    // varies per instance, the SHAPE it reads does not. Every instance reads
    // `output.artifactId`, so every instance declares the same field rule.
    appliesTo: { kind: "outputs", requires: ["artifactId"] },
    async run(output): Promise<CheckResult> {
      const id = (output as { artifactId?: unknown })?.artifactId;
      const passed = id === expectedId;
      return {
        checkId: `artifact.equals:${expectedId}`,
        verification: "reasoned",
        passed,
        reason: passed
          ? `artifact matches expected hash`
          : `expected ${expectedId}, got ${JSON.stringify(id)}`,
        detail: { expected: expectedId, actual: id },
      };
    },
  };
}
