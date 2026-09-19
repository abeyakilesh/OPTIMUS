/**
 * Where a mission's event log is kept so a surface can read it back.
 *
 * THE LOG IS THE PROTOCOL (ADR-0012, rule 2). Surfaces exchange events, never
 * state. The CLI folds this log, the canvas folds this log, and a second
 * device folds this log — so they cannot disagree about what happened. Storing
 * a rendered graph here instead would create a second source of truth that
 * goes stale the first time the projector improves.
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/data-dir";
import type { KernelEvent } from "@/kernel/events";

const LOGS_DIR = join(DATA_DIR, "mission-logs");

/** Filesystem-safe, and reversible enough to find again. */
function fileFor(missionId: string): string {
  return join(LOGS_DIR, `${missionId.replace(/[^A-Za-z0-9._-]+/g, "-")}.json`);
}

export async function saveMissionLog(
  missionId: string,
  events: readonly KernelEvent[],
): Promise<string> {
  await mkdir(LOGS_DIR, { recursive: true });
  const path = fileFor(missionId);
  await writeFile(path, JSON.stringify({ missionId, events }, null, 2), "utf8");
  return path;
}

export async function loadMissionLog(missionId: string): Promise<KernelEvent[] | undefined> {
  try {
    const raw = await readFile(fileFor(missionId), "utf8");
    const parsed = JSON.parse(raw) as { events?: KernelEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : undefined;
  } catch {
    return undefined; // no such mission — the caller answers 404, not 500
  }
}

/** Newest first, so a surface with no id can open the last run. */
export async function listMissionLogs(): Promise<string[]> {
  try {
    const files = await readdir(LOGS_DIR);
    const stamped = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const raw = await readFile(join(LOGS_DIR, f), "utf8");
          return JSON.parse(raw) as { missionId?: string };
        }),
    );
    return stamped.map((s) => s.missionId).filter((id): id is string => typeof id === "string").reverse();
  } catch {
    return [];
  }
}
