/**
 * POST /api/graph/run — start a mission and STREAM it as it happens.
 *
 * This is the difference between a log viewer and a workspace. The canvas was
 * rendering a finished mission it could only replay; here the browser watches
 * a real scheduler execute, node by node, as the work happens.
 *
 * `SchedulerDeps.onEvent` already existed for exactly this, with a docstring
 * saying so: "Fired for every event as it's emitted, not just at the end —
 * lets a caller persist or stream real progress (a live execution view)".
 * Nothing needed adding to the kernel.
 *
 * SSE rather than WebSocket, deliberately: a mission run is ONE-DIRECTIONAL —
 * the server narrates, the browser watches. A socket would add a second
 * transport, a reconnect protocol and a message envelope for no capability
 * this page needs. Commanding a run (pause, cancel) is a separate POST, not a
 * message on this stream.
 */

import type { NextRequest } from "next/server";
import { buildBroker, ALL_REPAIRS } from "@/kernel/registry";
import { Harness } from "@/kernel/harness";
import { Scheduler } from "@/kernel/scheduler";
import { DiskArtifactStore } from "@/kernel/artifacts";
import { buildDownloadMission } from "@/kernel/downloadMission";
import { saveMissionLog } from "@/lib/graph/store";
import { DATA_DIR } from "@/lib/data-dir";
import { join } from "node:path";
import type { KernelEvent } from "@/kernel/events";

export const dynamic = "force-dynamic";
/** Node, not Edge: the kernel spawns processes and touches the filesystem. */
export const runtime = "nodejs";

const REPO_REF = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/;
const MAX_REPOS = 25;

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid JSON body" }, { status: 400 });
  }

  const raw = (body as { repos?: unknown })?.repos;
  if (!Array.isArray(raw) || raw.length === 0) {
    return Response.json({ ok: false, reason: "requires { repos: string[] }" }, { status: 400 });
  }
  // Validated HERE, at the door, not inside the mission: these strings arrive
  // from a browser and choose what gets cloned.
  const repos = raw.filter((r): r is string => typeof r === "string" && REPO_REF.test(r));
  if (repos.length === 0) {
    return Response.json({ ok: false, reason: "no valid owner/repo entries" }, { status: 400 });
  }
  if (repos.length > MAX_REPOS) {
    return Response.json(
      { ok: false, reason: `at most ${MAX_REPOS} repos per run (got ${repos.length})` },
      { status: 400 },
    );
  }

  const mission = buildDownloadMission({ repos });
  const encoder = new TextEncoder();
  const collected: KernelEvent[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true; // client navigated away mid-run
        }
      };

      // The id goes first so the browser can name the run before any step
      // reports — otherwise a fast first event arrives for a mission the page
      // cannot yet identify.
      send("mission", { missionId: mission.id, objective: mission.objective, spec: mission });

      const broker = buildBroker();
      const store = new DiskArtifactStore(join(DATA_DIR, "artifacts"));
      const harness = new Harness({ broker, store });
      const scheduler = new Scheduler({
        harness,
        repairs: ALL_REPAIRS,
        onEvent: (event) => {
          collected.push(event);
          send("kernel", event);
        },
      });

      try {
        const result = await scheduler.run(mission);
        // Persisted so the page survives a reload and the CLI and browser
        // read the same log afterwards.
        await saveMissionLog(mission.id, result.log.all());
        send("done", { missionId: mission.id, green: result.green, status: result.state.status });
      } catch (error) {
        // A crashed scheduler is still a finished run from the browser's point
        // of view; reporting it as an event beats a stream that simply stops.
        await saveMissionLog(mission.id, collected).catch(() => undefined);
        send("failed", { missionId: mission.id, reason: String(error).slice(0, 500) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx and friends buffer SSE into uselessness without this.
      "X-Accel-Buffering": "no",
    },
  });
}
