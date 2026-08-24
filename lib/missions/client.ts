/**
 * The client half of a mission round trip.
 *
 * Split out of ChatPanel for one blunt reason: the UI reported EVERY failure
 * as "model layer unavailable" — including failures where the model was never
 * reached at all. A user hit `Failed to execute 'json' on 'Response':
 * Unexpected end of JSON input` and was told the model layer was down, when
 * the truth was that OPTIMUS's own reply never arrived intact. That is
 * Directive #4 in miniature: a message that misreports which boundary failed
 * is a demo that lies, and it cost two sessions of chasing the wrong
 * component.
 *
 * So every failure here is classified by WHICH boundary actually broke, and
 * each one carries the evidence that proves it (status code, body snippet,
 * elapsed budget). Living in its own module means these paths are unit-
 * testable against a fake fetch, which a component-embedded `await res.json()`
 * never was.
 */

import type { MissionApiResult, MissionStepResult } from "@/app/api/missions/route";
import type { MissionState } from "@/kernel/types";

/**
 * The browser leg's budget — CLAUDE.md: "No step runs without a declared
 * budget... A loop without a budget is a slot machine." The server step
 * already has one (llm.chat: maxAttempts 2 × a 60s netFetch, so ~120s worst
 * case). This is deliberately LONGER than that, so the server's own honest
 * verdict wins the race; a client timeout that fired first would mask a real
 * answer with a guess.
 */
export const CLIENT_BUDGET_MS = 135_000;

export type FailureKind =
  /** The request never came back at all — server down, connection refused. */
  | "unreachable"
  /** Our own budget expired, or the body was cut off mid-flight. */
  | "timed-out"
  /** 401 — the session is gone, nothing to do with the model. */
  | "signed-out"
  /** OPTIMUS answered, but not with the JSON contract it promises. */
  | "malformed"
  /** OPTIMUS refused the request itself (400) — a client-contract bug. */
  | "rejected"
  /** The mission genuinely could not be found (404). */
  | "not-found"
  /** OPTIMUS ran the mission for real, and the mission failed. */
  | "model-layer";

/** The headline shown to the user. Only ONE of these blames the model layer. */
const LABELS: Record<FailureKind, string> = {
  unreachable: "can't reach OPTIMUS",
  "timed-out": "no answer in time",
  "signed-out": "session expired",
  malformed: "unexpected response from OPTIMUS",
  rejected: "request rejected",
  "not-found": "mission not found",
  "model-layer": "model layer unavailable",
};

export interface MissionFailure {
  kind: FailureKind;
  label: string;
  detail: string;
  /** Present when the failure happened after a real mission was created. */
  missionId?: string;
  steps?: MissionStepResult[];
}

export type SendResult =
  | { ok: true; missionId: string; content: string; steps: MissionStepResult[] }
  | { ok: false; failure: MissionFailure };

export type LoadResult =
  | { ok: true; mission: MissionState; content?: string }
  | { ok: false; failure: MissionFailure };

export interface ClientOptions {
  /** Injectable so the failure paths can be tested without a real network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function fail(
  kind: FailureKind,
  detail: string,
  extra: Pick<MissionFailure, "missionId" | "steps"> = {},
): { ok: false; failure: MissionFailure } {
  return { ok: false, failure: { kind, label: LABELS[kind], detail, ...extra } };
}

/**
 * Build a failure for something the client already knows without a round trip
 * — e.g. reopening a mission that was persisted red. Goes through the same
 * LABELS table so a boundary can never acquire two different names.
 */
export function failureFor(
  kind: FailureKind,
  detail: string,
  extra: Pick<MissionFailure, "missionId" | "steps"> = {},
): MissionFailure {
  return { kind, label: LABELS[kind], detail, ...extra };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Enough of an unexpected body to diagnose it, not enough to wreck the layout. */
function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 120 ? `${flat.slice(0, 120)}…` : flat;
}

interface ParsedResponse {
  status: number;
  parsed: unknown;
}

/**
 * One HTTP round trip, with the body read as TEXT first. That ordering is the
 * whole point: `res.json()` collapses "empty body", "HTML error page" and
 * "valid JSON that says no" into one indistinguishable throw. Reading text
 * first keeps the evidence.
 */
async function requestJson(
  url: string,
  init: RequestInit,
  opts: ClientOptions,
): Promise<ParsedResponse | { ok: false; failure: MissionFailure }> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const budgetMs = opts.timeoutMs ?? CLIENT_BUDGET_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);

  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted) return fail("timed-out", `no response within ${budgetMs}ms`);
    return fail("unreachable", describe(error));
  }

  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    // Headers arrived but the body did not: a connection cut mid-response.
    // This is emphatically NOT a model-layer failure.
    if (controller.signal.aborted) return fail("timed-out", `body incomplete after ${budgetMs}ms`);
    return fail("unreachable", `HTTP ${res.status}, then the response was cut off — ${describe(error)}`);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) return fail("signed-out", "sign in again to continue");

  if (text.trim() === "") {
    // The exact shape behind "Unexpected end of JSON input", now named.
    return fail("malformed", `HTTP ${res.status} with an empty body`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail("malformed", `HTTP ${res.status}, body was not JSON: ${snippet(text)}`);
  }

  if (parsed === null || typeof parsed !== "object") {
    return fail("malformed", `HTTP ${res.status}, expected a JSON object: ${snippet(text)}`);
  }
  return { status: res.status, parsed };
}

function isFailure(
  value: ParsedResponse | { ok: false; failure: MissionFailure },
): value is { ok: false; failure: MissionFailure } {
  return "failure" in value;
}

/** Create and run a real mission from the current conversation. */
export async function sendMission(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  opts: ClientOptions = {},
): Promise<SendResult> {
  const result = await requestJson(
    "/api/missions",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) },
    opts,
  );
  if (isFailure(result)) return result;

  const body = result.parsed as Partial<MissionApiResult> & { reason?: string };
  const missionId = typeof body.missionId === "string" ? body.missionId : undefined;

  if (body.ok !== true) {
    if (result.status === 400) return fail("rejected", body.reason ?? "OPTIMUS rejected the request");
    // The server ran the mission and is telling us honestly that it failed.
    return fail("model-layer", body.reason ?? `mission failed (HTTP ${result.status})`, {
      missionId,
      steps: body.steps,
    });
  }

  if (!missionId) {
    return fail("malformed", `HTTP ${result.status} reported success without a mission id`);
  }
  if (typeof body.content !== "string") {
    // Green checks but no recoverable reply means the artifact store lost the
    // text. Say that, rather than rendering a confident empty bubble.
    return fail("malformed", "the mission passed its checks but its reply text could not be recovered", {
      missionId,
      steps: body.steps,
    });
  }

  return { ok: true, missionId, content: body.content, steps: body.steps ?? [] };
}

/** Reopen a persisted mission by id. */
export async function loadMission(id: string, opts: ClientOptions = {}): Promise<LoadResult> {
  const result = await requestJson(`/api/missions/${encodeURIComponent(id)}`, { method: "GET" }, opts);
  if (isFailure(result)) return result;

  const body = result.parsed as { ok?: boolean; reason?: string; content?: string; mission?: MissionState };

  if (body.ok !== true || !body.mission) {
    if (result.status === 404) return fail("not-found", body.reason ?? "no such mission");
    if (result.status === 400) return fail("rejected", body.reason ?? "invalid mission id");
    return fail("malformed", body.reason ?? `HTTP ${result.status} without a mission`);
  }
  return { ok: true, mission: body.mission, content: body.content };
}
