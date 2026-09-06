/**
 * Box #7/#8/#9's real backend: a chat message becomes a real MissionSpec,
 * run through the real Scheduler (not a bare harness.runStep call, so this
 * is genuinely using the mission machinery WP-001 built, even though
 * there's only one step in it today), persisted so the sidebar has
 * something real to list.
 *
 * TWO PATHS, BOTH NAMED IN THE RESPONSE (#73):
 *
 *   compiled  — the plan compiler turned the objective into a real DAG over the
 *               selectable capabilities, and that plan ran. This is the first
 *               time a mission with more than one capability is reachable from
 *               the product.
 *   chat      — the compiler REFUSED, honestly, and the objective is handled as
 *               a conversation: one llm.chat step, tagged at the trust boundary.
 *
 * The fallback is not a way of hiding a refusal. `compiled` and
 * `compilerReason` are in the response body precisely so a refusal is visible
 * rather than converted into something that looks like success — the compiler
 * declining is information, and D8 exists because a fabricated plan is worse
 * than an admitted one.
 *
 * WHY THE CHAT PATH IS NOT COMPILED. `llm.chat` is deliberately not selectable
 * by the compiler: every literal in a compiled plan was written by the model, so
 * a message it emits cannot truthfully carry `trust`. Here the tag is honest,
 * because this is the exact point where bytes stop being "whatever arrived over
 * HTTP" and become something the kernel is prepared to attribute to the
 * operator. See kernel/planCompiler.ts and #70.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { Harness } from "@/kernel/harness";
import { Scheduler } from "@/kernel/scheduler";
import { DiskArtifactStore } from "@/kernel/artifacts";
import { DiskMissionStore, type MissionSummary } from "@/kernel/missionStore";
import type { Evidence, MissionSpec } from "@/kernel/types";
import { buildBroker } from "@/kernel/registry";
import { DATA_DIR } from "@/lib/data-dir";
import { resolveChatContent } from "@/lib/missions/resolveChatContent";
import { isValidMessages, asOperatorMessages, INVALID_MESSAGES_REASON } from "@/lib/missions/clientMessages";
import { qualificationOf } from "@/kernel/models/qualified";
import { compilePlan } from "@/kernel/planCompiler";
import { ALL_CHECKS } from "@/kernel/registry";
import { compilerAsk } from "@/lib/missions/compilerAsk";

export const dynamic = "force-dynamic";

const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128";
const OMNIROUTE_MODEL = process.env.OMNIROUTE_DEFAULT_MODEL ?? "ollama/llama3.2:latest";

function missionStore() {
  return new DiskMissionStore(join(DATA_DIR, "missions"));
}

/**
 * Real, persistent storage — not the in-memory store the kernel's own tests
 * use. A mission reopened later from the sidebar needs the actual reply
 * text to still exist, not just its evidence.
 */
function artifactStore() {
  return new DiskArtifactStore(join(DATA_DIR, "artifacts"));
}

export interface MissionStepResult {
  id: string;
  capabilityId: string;
  status: string;
  durationMs?: number;
  checks: Array<{ checkId: string; passed: boolean; reason: string }>;
}

export interface MissionApiResult {
  ok: boolean;
  missionId: string;
  status: "green" | "red";
  content?: string;
  reason?: string;
  steps: MissionStepResult[];
  /** Which path ran: a compiled DAG, or the single-step chat fallback. */
  compiled: boolean;
  /**
   * Why the compiler declined, when it did. Present on the chat path and
   * absent on the compiled one — a refusal is information, not an embarrassment
   * to hide behind a reply that looks like success.
   */
  compilerReason?: string;
}

function summarizeSteps(evidenceByStep: Record<string, Evidence | undefined>, spec: MissionSpec): MissionStepResult[] {
  return spec.steps.map((step) => {
    const evidence = evidenceByStep[step.id];
    return {
      id: step.id,
      capabilityId: step.capabilityId,
      status: evidence ? "finished" : "did-not-run",
      durationMs: evidence?.durationMs,
      checks: (evidence?.checks ?? []).map((c) => ({
        checkId: c.checkId,
        passed: c.passed,
        reason: c.reason,
      })),
    };
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!isValidMessages(messages)) {
    return NextResponse.json(
      {
        ok: false,
        reason: INVALID_MESSAGES_REASON,
      },
      { status: 400 },
    );
  }

  // THE MODEL CONTRACT GATE (#49). This is the point where a model is
  // *registered as the chat backend*, so it is where qualification is checked.
  //
  // Deliberately here and not as an `enum` on llm.chat's input constraint: the
  // capability legitimately accepts a bad model id, because
  // omniroute-chat.test.ts must send one THROUGH to OmniRoute to exercise its
  // upstream failure path. Refusing at the broker would leave that test green
  // while it stopped testing what its name says.
  //
  // Directive #4: an unqualified backend is UNAVAILABLE and says so. It never
  // runs the mission anyway and never fabricates a reply.
  const verdict = qualificationOf(OMNIROUTE_MODEL);
  if (!verdict.qualified) {
    return NextResponse.json(
      { ok: false, reason: `model layer unavailable — ${verdict.reason}` },
      { status: 503 },
    );
  }

  const operatorMessages = asOperatorMessages(messages);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const objective = (lastUserMessage?.content ?? "chat").slice(0, 80);

  // One registry, shared with kernel/cli.ts. This registers every absorbed
  // capability, and the compiler's selectable SUBSET is derived from these
  // manifests — so what a model may choose from is the real set, filtered by
  // rules that live in code rather than in a document.
  const broker = buildBroker();
  const store = artifactStore();
  const harness = new Harness({ broker, store });
  const scheduler = new Scheduler({ harness });

  const missionId = randomUUID();
  const compiled = await compilePlan({
    objective,
    missionId,
    broker,
    checkIds: ALL_CHECKS.map((c) => c.id),
    ask: compilerAsk(harness, { baseUrl: OMNIROUTE_BASE_URL, model: OMNIROUTE_MODEL }),
  });

  const spec: MissionSpec = compiled.ok
    ? compiled.spec
    : {
        id: missionId,
        objective,
        steps: [
          {
            id: "chat",
            capabilityId: "llm.chat",
            // Tagged HERE, at the trust boundary — see the file docstring for
            // why this tag is honest and a compiled one would not be.
            input: { baseUrl: OMNIROUTE_BASE_URL, model: OMNIROUTE_MODEL, messages: operatorMessages },
            dependsOn: [],
            checks: ["llm.chatSucceeded"],
            agent: "chat",
          },
        ],
      };

  const result = await scheduler.run(spec);
  await missionStore().save(result.log);

  const evidenceByStep: Record<string, Evidence | undefined> = {};
  for (const [id, step] of Object.entries(result.state.steps)) evidenceByStep[id] = step.evidence;

  // Reply text exists only on the chat path: `resolveChatContent` reads
  // llm.chat's raw upstream response, and a compiled plan has no such step.
  // Returning nothing there is honest — a compiled mission's result is its
  // evidence, and rendering it is a surface question this route does not answer.
  const chatEvidence = evidenceByStep.chat;
  const content = result.green && !compiled.ok ? await resolveChatContent(chatEvidence, store) : undefined;

  const firstFailure = Object.values(evidenceByStep).find((e) =>
    e?.checks.some((c) => !c.passed),
  );

  const response: MissionApiResult = {
    ok: result.green,
    missionId: spec.id,
    status: result.green ? "green" : "red",
    content,
    reason: result.green
      ? undefined
      : (firstFailure?.checks.find((c) => !c.passed)?.reason ?? "mission did not complete"),
    steps: summarizeSteps(evidenceByStep, spec),
    compiled: compiled.ok,
    compilerReason: compiled.ok ? undefined : compiled.reason,
  };

  return NextResponse.json(response, { status: result.green ? 200 : 503 });
}

export async function GET() {
  const list: MissionSummary[] = await missionStore().list();
  return NextResponse.json({ ok: true, missions: list });
}
