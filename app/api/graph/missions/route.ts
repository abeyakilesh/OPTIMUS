/** GET /api/graph/missions — every mission that has been run, newest first. */
import { listMissionLogs } from "@/lib/graph/store";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(): Promise<Response> {
  return Response.json({ ok: true, missions: await listMissionLogs() });
}
