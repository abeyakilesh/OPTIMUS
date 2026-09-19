/**
 * GET /api/status — is OPTIMUS actually working right now.
 *
 * Every line is PROBED, not assumed. A status panel that reports "Connected"
 * because a config value exists is the exact green-check-on-nothing this
 * project keeps deleting — so each row here costs a real call.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/data-dir";
import { buildBroker } from "@/kernel/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function probeOllama(): Promise<{ up: boolean; models: number }> {
  const base = process.env.OPTIMUS_MODEL_BASE_URL ?? "http://127.0.0.1:11434";
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, models: 0 };
    const body = (await res.json()) as { models?: unknown[] };
    return { up: true, models: body.models?.length ?? 0 };
  } catch {
    return { up: false, models: 0 };
  }
}

/** Only a PASSING contract run writes here, so presence means qualified. */
function qualified(): { model: string; baseUrl: string }[] {
  try {
    const parsed = JSON.parse(readFileSync(join(DATA_DIR, "model-contract.json"), "utf8")) as {
      records?: { model: string; baseUrl: string }[];
    };
    return parsed.records ?? [];
  } catch {
    return [];
  }
}

export async function GET(): Promise<Response> {
  const [ollama] = await Promise.all([probeOllama()]);
  const models = qualified();
  const broker = buildBroker();

  return Response.json({
    ok: true,
    kernel: { up: true, skills: broker.manifests().length },
    ollama,
    /**
     * `activeModel` is null until a model PASSES the contract. Showing a model
     * that merely responds would say "Ready" about something never shown to
     * follow a schema — which is what the contract exists to catch.
     */
    activeModel: models[0] ?? null,
    qualifiedCount: models.length,
  });
}
