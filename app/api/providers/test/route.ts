import { NextResponse } from "next/server";
import { PROVIDERS } from "@/lib/providers/catalog";
import { testProvider, type TestResult } from "@/lib/providers/probe";

/**
 * POST /api/providers/test — the expensive half, run only on demand.
 *
 * Sends ONE real inference request with `max_tokens: 1`, because that is the
 * only response on which Groq and Mistral report remaining quota. It is a
 * button and not a poll for exactly that reason: a 60-second poll would
 * consume the allowance it claims to measure, and the number on screen would
 * become a function of the page being open.
 *
 * `{ id }` names one provider. The response carries measured latency and
 * whatever rate-limit headers the provider genuinely sent — never a key.
 */

export const dynamic = "force-dynamic";

export interface ProviderTestResponse {
  ok: boolean;
  result?: TestResult;
  reason?: string;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "expected a JSON body" }, { status: 400 });
  }

  const { id, model } = (body ?? {}) as { id?: unknown; model?: unknown };
  if (typeof id !== "string") {
    return NextResponse.json({ ok: false, reason: "expected { id: string }" }, { status: 400 });
  }
  if (model !== undefined && typeof model !== "string") {
    return NextResponse.json({ ok: false, reason: "model must be a string when supplied" }, { status: 400 });
  }

  const def = PROVIDERS.find((p) => p.id === id);
  if (!def) {
    // Closed set — a caller cannot name an arbitrary host for us to POST to.
    return NextResponse.json({ ok: false, reason: `no such provider: ${id}` }, { status: 404 });
  }

  const result = await testProvider(def, model);
  return NextResponse.json({ ok: result.ok, result } satisfies ProviderTestResponse);
}
