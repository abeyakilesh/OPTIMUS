/**
 * Reopening a past mission from the sidebar — reads the real persisted
 * EventLog and folds it, exactly like the summary list does, just for one
 * mission with full detail instead of a summary. Also resolves the real
 * reply text from disk (see resolveChatContent) so a reopened mission
 * shows the actual historical answer, not just its evidence/checks.
 */

import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { DiskArtifactStore } from "@/kernel/artifacts";
import { DiskMissionStore } from "@/kernel/missionStore";
import { DATA_DIR } from "@/lib/data-dir";
import { resolveChatContent } from "@/lib/missions/resolveChatContent";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = new DiskMissionStore(join(DATA_DIR, "missions"));

  let state;
  try {
    state = await store.load(id);
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid mission id" }, { status: 400 });
  }

  if (!state) {
    return NextResponse.json({ ok: false, reason: "no such mission" }, { status: 404 });
  }

  const artifacts = new DiskArtifactStore(join(DATA_DIR, "artifacts"));
  const chatStep = state.steps.chat;
  const content =
    chatStep?.status === "passed" ? await resolveChatContent(chatStep.evidence, artifacts) : undefined;

  return NextResponse.json({ ok: true, mission: state, content });
}
