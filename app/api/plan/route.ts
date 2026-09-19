/**
 * POST /api/plan — turn a goal into a proposed mission, WITHOUT running it.
 *
 * A plan is a mission that has not been applied. Producing one must therefore
 * touch nothing: no clone, no fetch, no write. This route compiles and returns.
 *
 * ⚠️ It reports its blocker honestly. Planning needs a model that passed the
 * model contract, and when none has, the answer says so and says what to run —
 * rather than returning an empty plan that looks like OPTIMUS had no ideas.
 */

import type { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/data-dir";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Which models have passed, written only by a passing contract run. */
function qualifiedModels(): { model: string; baseUrl: string }[] {
  try {
    const raw = readFileSync(join(DATA_DIR, "model-contract.json"), "utf8");
    const parsed = JSON.parse(raw) as { records?: { model: string; baseUrl: string }[] };
    return parsed.records ?? [];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid JSON body" }, { status: 400 });
  }
  const goal = (body as { goal?: unknown })?.goal;
  if (typeof goal !== "string" || goal.trim().length === 0) {
    return Response.json({ ok: false, reason: "requires { goal: string }" }, { status: 400 });
  }

  const qualified = qualifiedModels();
  if (qualified.length === 0) {
    return Response.json(
      {
        ok: false,
        reason:
          "No model has passed the model contract, so nothing can write a plan yet. " +
          "A model is only trusted to plan after it has been shown to return strict JSON, " +
          "follow an exact format, refuse to invent facts, produce the compiler's nested " +
          "plan schema, and decline an objective no skill can serve. " +
          "Qualify one with:  npx tsx scripts/model-contract.ts <model> <baseUrl> --record",
      },
      { status: 503 },
    );
  }

  // A qualified model exists — the compiler runs from here. Left explicit
  // rather than silently returning nothing, so the next piece of work is
  // visible in the code as well as in the response.
  return Response.json(
    {
      ok: false,
      reason:
        `A qualified model is available (${qualified[0].model}), but the planner is not ` +
        `wired to this page yet. That is the next piece of work, not a missing model.`,
    },
    { status: 501 },
  );
}
