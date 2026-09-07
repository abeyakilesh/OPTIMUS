/**
 * GET /api/graph/[id] — a mission's canonical graph.
 *
 * Reads the event log and folds it with the SAME projector the CLI and any
 * future live stream use. The server does not keep a rendered graph anywhere:
 * a stored projection would go stale the moment the projector improves, and
 * two readers folding one log cannot disagree.
 */

import { NextResponse } from "next/server";
import { loadMissionLog, listMissionLogs } from "@/lib/graph/store";
import { projectLog } from "@/lib/graph/projector";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  // `latest` is how the canvas opens without the caller knowing an id — the
  // common case right after a CLI run.
  const missionId = id === "latest" ? (await listMissionLogs())[0] : decodeURIComponent(id);
  if (!missionId) {
    return NextResponse.json({ ok: false, reason: "no missions have been run yet" }, { status: 404 });
  }

  const events = await loadMissionLog(missionId);
  if (!events) {
    return NextResponse.json({ ok: false, reason: `no log for mission ${missionId}` }, { status: 404 });
  }

  const graph = projectLog(events, missionId);
  return NextResponse.json({ ok: true, graph, eventCount: events.length });
}
