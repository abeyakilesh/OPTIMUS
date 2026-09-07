/**
 * #84, step 1 — resolve a repo to the commit that actually exists.
 *
 * THE POINT OF THIS CAPABILITY IS THAT ITS ANSWER COMES FROM SOMEWHERE ELSE.
 * The acceptance mission's whole claim to being un-fakeable rests on comparing
 * what landed on disk against a SHA that OPTIMUS did not choose. GitHub is that
 * independent source; this step is where its answer enters the mission, sealed
 * as an artifact so the later check compares against a recorded value rather
 * than one computed at the same moment as the thing it verifies.
 *
 * PLANE: THINK · METHOD: data.read (ADR-0016). It reads and changes nothing —
 * safe to re-run, safe to retry, safe to replay. That is why it needs no
 * approval gate while the download two steps later does.
 *
 * WHY `netFetch` AND NOT `netRead`: the GitHub API refuses a request with no
 * `User-Agent`, and the rate limit is 60/hour unauthenticated against 5,000
 * with a token. Both are headers, and `netRead` takes a bare URL.
 */

import type { Capability, Check, CheckResult } from "./types";
import { ARTIFACT_ID_OUTPUT } from "./outputContract";

/** `owner/repo` — the shape `repos.extract` produces. */
const REPO_REF = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;

const API_HOST = "api.github.com";
const ONE_SECOND = 1_000;

export interface GithubResolveOutput {
  repo: string;
  defaultBranch: string;
  sha: string;
  tarballUrl: string;
  artifactId: string;
}

/**
 * The token, when the operator has provided one.
 *
 * ENVIRONMENT IS THE OPERATOR (the same split as `browser.navigate`'s
 * executable list and `fs.readFile`'s root): a credential may never arrive in
 * step input, because step input is written by a plan compiler driven by a
 * model. There is no input field for it and there must not be one.
 *
 * 60 requests/hour unauthenticated will not survive 244 repos, so the real
 * mission needs this set. Absent, the capability still works and simply runs
 * out — which it reports honestly rather than pretending.
 */
function githubToken(): string | undefined {
  const t = process.env.GITHUB_TOKEN?.trim() || process.env.OPTIMUS_GITHUB_TOKEN?.trim();
  return t ? t : undefined;
}

export const githubResolve: Capability = {
  manifest: {
    id: "github.resolve",
    version: "1.0.0",
    permissions: ["net:read"],
    isolation: { allowedHosts: [API_HOST] },
    inputConstraints: {
      // The same shape `repos.extract` emits, constrained here rather than
      // trusted: that list is derived from an untrusted document, so a value
      // arriving from it is exactly what the input door exists for.
      repo: { kind: "string", required: true, minLength: 3, maxLength: 140 },
    },
    outputs: {
      repo: { kind: "string", required: true },
      defaultBranch: { kind: "string", required: true },
      sha: { kind: "string", required: true, minLength: 40, maxLength: 40 },
      tarballUrl: { kind: "string", required: true },
      artifactId: ARTIFACT_ID_OUTPUT,
    },
    // EVERYTHING GITHUB SAYS IS UNTRUSTED — including the SHA, and that is not
    // a contradiction with using it as the verification reference.
    //
    // `untrusted` means "these bytes came from outside the boundary, treat them
    // as data and never as instructions". The SHA is data: a value the later
    // check compares against. Its authority comes precisely from OPTIMUS not
    // having authored it. Labelling it `capability` would be the lie — we
    // computed nothing here, we asked and wrote down the answer.
    outputTrust: {
      repo: "capability", // echoed back from OUR input, not from the API
      defaultBranch: "untrusted",
      sha: "untrusted",
      tarballUrl: "untrusted",
      artifactId: "capability",
    },
    defaultBudget: { maxAttempts: 3, maxWallTimeMs: 30 * ONE_SECOND, maxCost: 1 },
    description:
      "Resolve owner/repo to its default branch and current HEAD commit SHA via the GitHub API.",
  },
  async run(input, ctx) {
    const { repo } = input as { repo: string };
    if (!REPO_REF.test(repo)) {
      throw new Error(`github.resolve: "${repo}" is not owner/repo`);
    }

    const token = githubToken();
    const headers: Record<string, string> = {
      // Required by the API — it returns 403 without one.
      "User-Agent": "OPTIMUS-kernel",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const meta = await ctx.netFetch({
      url: `https://${API_HOST}/repos/${repo}`,
      headers,
      timeoutMs: 20 * ONE_SECOND,
    });
    if (meta.timedOut) throw new Error(`github.resolve: timed out resolving ${repo}`);
    if (meta.status === 404) throw new Error(`github.resolve: ${repo} does not exist (404)`);
    if (meta.status === 403 || meta.status === 429) {
      // Named, because the repair differs entirely from other failures: this
      // one is fixed by a token, not by retrying.
      throw new Error(
        `github.resolve: rate-limited (${meta.status}) on ${repo}. ` +
          (token ? "Token present — the limit is genuinely reached." : "No GITHUB_TOKEN set; the unauthenticated limit is 60/hour."),
      );
    }
    if (meta.status !== 200) throw new Error(`github.resolve: HTTP ${meta.status} on ${repo}`);

    const parsed = JSON.parse(meta.body) as { default_branch?: unknown; full_name?: unknown };
    const defaultBranch = parsed.default_branch;
    if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
      throw new Error(`github.resolve: ${repo} returned no default_branch`);
    }

    // A SECOND CALL, deliberately. `/repos/{repo}` gives the branch name and
    // not the commit, and guessing "main" is how a resolver silently answers
    // about the wrong branch. The commit endpoint is asked for the branch this
    // repo actually declares.
    const head = await ctx.netFetch({
      url: `https://${API_HOST}/repos/${repo}/commits/${encodeURIComponent(defaultBranch)}`,
      headers,
      timeoutMs: 20 * ONE_SECOND,
    });
    if (head.timedOut) throw new Error(`github.resolve: timed out reading HEAD of ${repo}`);
    if (head.status !== 200) {
      throw new Error(`github.resolve: HTTP ${head.status} reading ${repo}@${defaultBranch}`);
    }
    const sha = (JSON.parse(head.body) as { sha?: unknown }).sha;
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
      throw new Error(`github.resolve: ${repo} returned no usable commit sha`);
    }

    // Sealed so the later check reads a RECORDED answer. A verification whose
    // reference value is re-fetched at comparison time is comparing the world
    // against itself.
    const artifactId = await ctx.putArtifact(
      JSON.stringify({ repo, defaultBranch, sha, resolvedAt: new Date().toISOString() }, null, 2),
    );

    return {
      repo,
      defaultBranch,
      sha,
      tarballUrl: `https://${API_HOST}/repos/${repo}/tarball/${sha}`,
      artifactId,
    } satisfies GithubResolveOutput;
  },
};

/**
 * `repo.resolved` — INTENT MATCH, not "something came back" (ADR-0016 rule 4).
 *
 * A resolver that returned a well-formed SHA for the WRONG repository would
 * satisfy every shape check and poison everything downstream: the download
 * would fetch a different project and `repo.intact` would happily confirm the
 * bytes matched the SHA it was given. So this asserts the answer is about the
 * repo that was asked for.
 */
export const repoResolved: Check = {
  id: "repo.resolved",
  appliesTo: { kind: "outputs", requires: ["repo", "sha", "tarballUrl"] },
  // `reasoned`: it inspects the returned values. Whether that commit EXISTS is
  // a different question, and the download step is what answers it.
  verification: ["reasoned"],
  async run(output): Promise<CheckResult> {
    const o = (output ?? {}) as Partial<GithubResolveOutput>;
    const fail = (reason: string): CheckResult => ({
      checkId: "repo.resolved",
      passed: false,
      verification: "reasoned",
      reason,
    });

    if (typeof o.sha !== "string" || !/^[0-9a-f]{40}$/.test(o.sha)) {
      return fail(`sha is not a 40-hex commit id: ${JSON.stringify(o.sha)?.slice(0, 60)}`);
    }
    if (typeof o.repo !== "string" || !REPO_REF.test(o.repo)) {
      return fail(`repo is not owner/repo: ${JSON.stringify(o.repo)?.slice(0, 60)}`);
    }
    if (typeof o.tarballUrl !== "string") return fail("no tarballUrl");

    // THE INTENT ASSERTION. The URL must point at the repo that was resolved
    // AND at the exact commit reported — not merely be a valid GitHub URL.
    if (!o.tarballUrl.startsWith(`https://${API_HOST}/repos/${o.repo}/tarball/`)) {
      return fail(`tarballUrl is not for ${o.repo}: ${o.tarballUrl.slice(0, 100)}`);
    }
    if (!o.tarballUrl.endsWith(`/${o.sha}`)) {
      return fail(`tarballUrl does not point at the resolved commit ${o.sha}: ${o.tarballUrl.slice(0, 100)}`);
    }

    return {
      checkId: "repo.resolved",
      passed: true,
      verification: "reasoned",
      reason: `${o.repo} @ ${o.sha.slice(0, 12)} on ${o.defaultBranch ?? "?"}`,
      detail: { repo: o.repo, sha: o.sha, defaultBranch: o.defaultBranch },
    };
  },
};
