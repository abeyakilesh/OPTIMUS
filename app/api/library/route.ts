/**
 * GET /api/library — everything OPTIMUS can actually do, and the gap.
 *
 * ⚠️ BUILT DELIBERATELY AGAINST THE NEXUS FAILURE. nexus shipped a catalogue of
 * 832 skills, every one of which pointed at an integration nobody had wired.
 * The catalogue was the product; none of it ran. A library that lists what
 * OPTIMUS *could* do is that failure with better styling.
 *
 * So this route reports only what is REGISTERED IN THE BROKER — the same
 * broker a mission runs against. If it appears here, a mission can call it.
 * The number will look small. That is the honest number, and the gap between
 * it and the repos on disk is reported as its own field rather than hidden.
 */

import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Harness } from "@/kernel/harness";
import { MemoryArtifactStore } from "@/kernel/artifacts";
import { join } from "node:path";
import { buildBroker } from "@/kernel/registry";
import { CAPABILITY_SELECTION } from "@/kernel/planCompiler";
import { semanticsFor } from "@/lib/graph/semantics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** What a permission MEANS, for a person. */
const PERMISSION_WORDS: Record<string, string> = {
  "net:read": "Read from the internet",
  "net:write": "Send data to the internet",
  "fs:read": "Read files on this machine",
  "fs:write": "Write files on this machine",
  "proc:spawn": "Run programs on this machine",
};

/** Where the repo collection lives — the same root fs.readFile is bounded to. */
function collectionRoot(): string {
  return resolve(process.env.OPTIMUS_TASKLIST_ROOT?.trim() ?? process.cwd());
}

function taskListPath(): string {
  return (
    process.env.OPTIMUS_TASKLIST_PATH?.trim() ??
    join(collectionRoot(), "Repo collection and their use", "MISSING_DOMAINS_AND_REPOS.md")
  );
}

/**
 * Repositories sitting on disk, absorbed or not.
 *
 * ⚠️ Read directly rather than through a capability, because OPTIMUS has no
 * directory-listing capability yet. That is a REAL GAP, named here rather than
 * papered over: every other input on this page goes through the kernel, and
 * this one does not until `fs.listDir` exists.
 */
async function reposOnDisk(): Promise<string[]> {
  try {
    const entries = await readdir(collectionRoot(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * The repositories a mission would still have to fetch. Read BY OPTIMUS, using
 * the same two capabilities the download mission uses — so this number cannot
 * drift from what a real run would find.
 */
async function reposToDownload(): Promise<{ repos: string[]; error?: string }> {
  try {
    const broker = buildBroker();
    const harness = new Harness({ broker, store: new MemoryArtifactStore() });
    const read = await harness.runStep({
      id: "vault-read", capabilityId: "fs.readFile",
      input: { path: taskListPath() }, dependsOn: [], checks: ["artifact.intact"],
    });
    if (read.status !== "passed") return { repos: [], error: `could not read ${taskListPath()}` };
    const extract = await harness.runStep({
      id: "vault-extract", capabilityId: "repos.extract",
      input: { artifactId: (read.output as { artifactId: string }).artifactId },
      dependsOn: [], checks: ["repos.found"],
    });
    if (extract.status !== "passed") return { repos: [], error: "could not parse the task list" };
    return { repos: (extract.output as { repos: string[] }).repos };
  } catch (e) {
    return { repos: [], error: String(e).slice(0, 200) };
  }
}

/** Loose match: a directory named after the repo, however it was unpacked. */
function isOnDisk(repo: string, dirs: Set<string>): boolean {
  const name = repo.split("/")[1]?.toLowerCase() ?? "";
  if (!name) return false;
  for (const d of dirs) {
    const bare = d.toLowerCase().replace(/-(main|master|release.*|[0-9.]+x?)$/, "");
    if (bare === name) return true;
  }
  return false;
}

export async function GET(): Promise<Response> {
  const broker = buildBroker();
  const manifests = broker.manifests();

  const capabilities = manifests.map((m) => {
    const sem = semanticsFor(m.id);
    const selection = CAPABILITY_SELECTION[m.id];
    return {
      id: m.id,
      /** What it does, in words. */
      does: sem.verb,
      /** Who does it. */
      agent: sem.agent,
      /** What it produces, in words. */
      gives: sem.produces ?? "a result",
      /** What it needs from the caller, named as the contract names them. */
      needs: Object.keys(m.inputConstraints ?? {}),
      /** What it is allowed to touch, in plain words. */
      allowed: (m.permissions ?? []).map((p) => PERMISSION_WORDS[p] ?? p),
      /**
       * Whether the PLANNER may choose it, and why not when it may not. The
       * reason is the recorded one, never invented here — an unexplained
       * "unavailable" is the kind of dead end this project keeps deleting.
       */
      plannable: selection?.selectable ?? false,
      whyNot: selection?.selectable === false ? selection.reason : undefined,
      version: m.version,
    };
  });

  const [disk, wanted] = await Promise.all([reposOnDisk(), reposToDownload()]);
  const diskSet = new Set(disk);
  const missing = wanted.repos.filter((r) => !isOnDisk(r, diskSet));
  const alreadyHere = wanted.repos.filter((r) => isOnDisk(r, diskSet));

  return Response.json({
    ok: true,
    /**
     * `measured` — counted from the broker just now. Not a figure from a
     * document, and deliberately not padded with things that exist on disk
     * but are not wired.
     */
    method: "measured",
    total: capabilities.length,
    plannable: capabilities.filter((c) => c.plannable).length,
    capabilities: capabilities.sort((a, b) => a.does.localeCompare(b.does)),
    /**
     * THE THREE HONEST TIERS. Every count is measured now, from the broker,
     * the filesystem and OPTIMUS's own reading of its task list.
     */
    shelves: {
      wired: capabilities.length,
      onDisk: disk.length,
      /** On the wanted list AND already downloaded — absorbed or not. */
      downloadedNotWired: alreadyHere.length,
      /** Still to fetch. */
      toDownload: missing.length,
    },
    toDownload: missing.slice(0, 400),
    downloadedNotWired: alreadyHere.slice(0, 400),
    tasklistError: wanted.error,
  });
}
