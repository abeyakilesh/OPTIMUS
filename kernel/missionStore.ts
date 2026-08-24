/**
 * Persistence for missions — the thing a workspace sidebar needs that
 * didn't exist before: somewhere real to list past runs from. Built on
 * exactly what WP-001 already proved: EventLog.toJSON()/fromJSON() plus
 * fold() rebuilding MissionState from the log alone (AC-6). Nothing new
 * invented here — this is that machinery, persisted.
 *
 * Same ports-and-adapters shape as ArtifactStore: Memory for tests, Disk
 * for real runs.
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { EventLog, fold, type KernelEvent } from "./events";
import type { MissionState } from "./types";

export interface MissionSummary {
  id: string;
  objective: string;
  status: MissionState["status"];
  startedAt: number;
}

export interface MissionStore {
  save(log: EventLog): Promise<void>;
  load(id: string): Promise<MissionState | undefined>;
  list(): Promise<MissionSummary[]>;
}

function summarize(log: EventLog): MissionSummary | undefined {
  const events = log.all();
  const state = fold(events);
  if (!state) return undefined;
  const started = events.find((e): e is Extract<KernelEvent, { type: "mission.started" }> =>
    e.type === "mission.started",
  );
  return {
    id: state.spec.id,
    objective: state.spec.objective,
    status: state.status,
    startedAt: started?.at ?? 0,
  };
}

function byRecency(a: MissionSummary, b: MissionSummary): number {
  return b.startedAt - a.startedAt;
}

/** A well-formed mission id only — rejected before it ever reaches a filename or map key. */
function assertValidId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error(`Malformed mission id: ${id}`);
  }
}

export class MemoryMissionStore implements MissionStore {
  private readonly logs = new Map<string, EventLog>();

  async save(log: EventLog): Promise<void> {
    const summary = summarize(log);
    if (!summary) throw new Error("cannot save a mission with no state");
    assertValidId(summary.id);
    this.logs.set(summary.id, log);
  }

  async load(id: string): Promise<MissionState | undefined> {
    assertValidId(id);
    const log = this.logs.get(id);
    return log ? fold(log.all()) : undefined;
  }

  async list(): Promise<MissionSummary[]> {
    return [...this.logs.values()]
      .map(summarize)
      .filter((s): s is MissionSummary => s !== undefined)
      .sort(byRecency);
  }
}

export class DiskMissionStore implements MissionStore {
  constructor(private readonly root: string) {}

  private pathFor(id: string): string {
    assertValidId(id);
    return join(this.root, `${id}.json`);
  }

  async save(log: EventLog): Promise<void> {
    const summary = summarize(log);
    if (!summary) throw new Error("cannot save a mission with no state");
    await mkdir(this.root, { recursive: true });
    await writeFile(this.pathFor(summary.id), log.toJSON(), "utf8");
  }

  async load(id: string): Promise<MissionState | undefined> {
    const path = this.pathFor(id);
    if (!existsSync(path)) return undefined;
    return fold(EventLog.fromJSON(await readFile(path, "utf8")).all());
  }

  async list(): Promise<MissionSummary[]> {
    await mkdir(this.root, { recursive: true });
    const files = (await readdir(this.root)).filter((f) => f.endsWith(".json"));
    const summaries: MissionSummary[] = [];
    for (const file of files) {
      const raw = await readFile(join(this.root, file), "utf8");
      const summary = summarize(EventLog.fromJSON(raw));
      if (summary) summaries.push(summary);
    }
    return summaries.sort(byRecency);
  }
}
