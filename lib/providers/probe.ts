import "server-only";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DATA_DIR } from "@/lib/data-dir";
import {
  PROVIDERS,
  isModelUnavailable,
  maskKey,
  rankChatModels,
  type ModelInfo,
  type ProviderDef,
} from "./catalog";

/**
 * Server-side probing. Two rules hold everywhere in this file:
 *
 *  1. A key is read from the environment, used, and never returned. Only
 *     `maskKey()` output crosses the wire.
 *  2. Every number returned is one a provider actually sent. Anything we
 *     could only estimate is `null` with a stated reason, never a plausible
 *     default. A bar drawn from a guess is worse than no bar, because the
 *     reader cannot tell which they are looking at.
 */

export interface RateLimit {
  limitRequests: number | null;
  remainingRequests: number | null;
  limitTokens: number | null;
  remainingTokens: number | null;
  /** Provider-reported, verbatim (e.g. Groq's "1m26.4s"). */
  resetRequestsRaw: string | null;
  resetTokensRaw: string | null;
  /** Absolute instant, derived from the raw duration above. Labelled as derived. */
  resetRequestsAt: string | null;
  window: string;
  /** When we harvested it — these are a point-in-time reading, not live. */
  observedAt: string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  keyPresent: boolean;
  maskedKey: string | null;
  /** Did the catalogue endpoint answer? Separate from "is the key valid". */
  reachable: boolean;
  httpStatus: number | null;
  modelCount: number | null;
  models: string[];
  /** Provider-reported detail, used to choose a test model on real fields. */
  modelInfo: ModelInfo[];
  /** The model a test would use, and why it was picked. */
  suggestedModel: string | null;
  suggestedModelReason: string | null;
  /** Ranked candidates, best first — the test walks at most the first two. */
  rankedModels: string[];
  error: string | null;
  usageSource: ProviderDef["usageSource"];
  usageNote: string | null;
  latencyMs: number | null;
}

export interface MissionCostSample {
  /** Real mean, computed from stored mission evidence. */
  meanTokens: number | null;
  sampleSize: number;
  note: string;
}

const TIMEOUT_MS = 12_000;
/**
 * How many models a connection test may try before giving up.
 *
 * Bounded, not a loop over the catalogue: this endpoint spends real quota, and
 * a "recovery" that walks 56 models is a cost pretending to be resilience.
 * Three is enough to clear Mistral's tier-locked top of list now that aliases
 * are collapsed, and small enough that a wholly unusable key fails fast.
 */
const MAX_TEST_CANDIDATES = 3;

function authFor(def: ProviderDef, key: string): { url: string; headers: Record<string, string> } {
  if (def.auth === "query") {
    return { url: `${def.modelsUrl}?key=${encodeURIComponent(key)}`, headers: {} };
  }
  return { url: def.modelsUrl, headers: { Authorization: `Bearer ${key}` } };
}

/** Turns "1m26.4s" / "547ms" into milliseconds. Returns null if unparseable. */
export function parseResetDuration(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const re = /(\d+(?:\.\d+)?)(ms|s|m|h)/g;
  let total = 0;
  let matched = false;
  for (const [, n, unit] of trimmed.matchAll(re)) {
    matched = true;
    const v = Number(n);
    total += unit === "ms" ? v : unit === "s" ? v * 1000 : unit === "m" ? v * 60_000 : v * 3_600_000;
  }
  return matched ? total : null;
}

function numberOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function readRateLimit(def: ProviderDef, headers: Headers, now = Date.now()): RateLimit | null {
  const map = def.headerMap;
  if (!map) return null;
  const get = (name?: string) => (name ? headers.get(name) : null);

  const limitRequests = numberOrNull(get(map.limitRequests));
  const remainingRequests = numberOrNull(get(map.remainingRequests));
  const limitTokens = numberOrNull(get(map.limitTokens));
  const remainingTokens = numberOrNull(get(map.remainingTokens));

  // If the provider sent nothing usable, say nothing. An all-null RateLimit
  // would render as a row of dashes that looks like a failed reading rather
  // than an absent feature.
  if (limitRequests === null && limitTokens === null) return null;

  const resetRequestsRaw = get(map.resetRequests);
  const resetMs = resetRequestsRaw ? parseResetDuration(resetRequestsRaw) : null;

  return {
    limitRequests,
    remainingRequests,
    limitTokens,
    remainingTokens,
    resetRequestsRaw,
    resetTokensRaw: get(map.resetTokens),
    resetRequestsAt: resetMs === null ? null : new Date(now + resetMs).toISOString(),
    window: map.window,
    observedAt: new Date(now).toISOString(),
  };
}

/** Cheap status: is the key there, does the catalogue answer, what models exist. */
export async function probeProvider(def: ProviderDef): Promise<ProviderStatus> {
  const key = process.env[def.envVar]?.trim();
  const base: ProviderStatus = {
    id: def.id,
    name: def.name,
    keyPresent: Boolean(key),
    maskedKey: key ? maskKey(key) : null,
    reachable: false,
    httpStatus: null,
    modelCount: null,
    models: [],
    modelInfo: [],
    suggestedModel: null,
    suggestedModelReason: null,
    rankedModels: [],
    error: null,
    usageSource: def.usageSource,
    usageNote: def.usageNote ?? null,
    latencyMs: null,
  };

  if (!key) return { ...base, error: `${def.envVar} is not set` };

  const { url, headers } = authFor(def, key);
  const startedAt = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const latencyMs = Date.now() - startedAt;
    const text = await res.text();

    if (!res.ok) {
      // Report the provider's own words, with the key stripped in case it
      // echoed one back. "Not connected" with a reason beats a red dot.
      return {
        ...base,
        httpStatus: res.status,
        latencyMs,
        error: redact(text, key).slice(0, 300) || `HTTP ${res.status}`,
      };
    }

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const list = parsed[def.modelsPath];
    const modelInfo = Array.isArray(list)
      ? list
          .map((m) => def.describeModel(m as Record<string, unknown>))
          .filter((m): m is ModelInfo => m !== null)
      : [];
    const picked = rankChatModels(modelInfo)[0] ?? null;
    const chatCount = modelInfo.filter((m) => m.chatCapable === true).length;

    return {
      ...base,
      reachable: true,
      httpStatus: res.status,
      modelCount: modelInfo.length,
      models: modelInfo.map((m) => m.id),
      modelInfo,
      rankedModels: rankChatModels(modelInfo).map((m) => m.id),
      suggestedModel: picked?.id ?? null,
      suggestedModelReason: picked
        ? `largest context window (${picked.contextWindow === null ? "unreported" : picked.contextWindow.toLocaleString("en-US")})` +
          (chatCount > 0 ? ` among the ${chatCount} the provider marks as text-chat` : " (provider states no chat capability flags)")
        : null,
      latencyMs,
    };
  } catch (error) {
    return {
      ...base,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? redact(error.message, key) : "request failed",
    };
  }
}

/** Belt and braces: a key must not travel back inside an error string either. */
function redact(text: string, key: string): string {
  return key ? text.split(key).join("«redacted»") : text;
}

export interface TestResult {
  id: string;
  ok: boolean;
  latencyMs: number;
  httpStatus: number | null;
  model: string | null;
  error: string | null;
  rateLimit: RateLimit | null;
  /** Honest when a provider simply publishes nothing. */
  usageUnavailableReason: string | null;
  /** Set when the provider refused our first choice and we used the next. */
  fellBackFrom?: string | null;
}

/**
 * A real connection test: one inference call with `max_tokens: 1`.
 *
 * It costs a token, deliberately and visibly, because that is the only place
 * Groq and Mistral report quota. The model is taken from the provider's own
 * live catalogue rather than hardcoded — the spec's example named
 * `llama-3.3-70b-versatile`, which this Groq account returned 404 for.
 */
export async function testProvider(def: ProviderDef, model?: string): Promise<TestResult> {
  const key = process.env[def.envVar]?.trim();
  const empty: TestResult = {
    id: def.id,
    ok: false,
    latencyMs: 0,
    httpStatus: null,
    model: null,
    error: null,
    rateLimit: null,
    usageUnavailableReason: def.usageSource === "none" ? (def.usageNote ?? "not published by this provider") : null,
    fellBackFrom: null,
  };
  if (!key) return { ...empty, error: `${def.envVar} is not set` };

  // A provider whose quota is unreadable still gets a REAL connection test —
  // the button promises a live ping and a latency, and that much is genuinely
  // measurable. It pings the catalogue rather than inference: spending a
  // token to learn nothing about quota would be a cost with no reading
  // attached. What it cannot report, it names.
  if (!def.inference) {
    const status = await probeProvider(def);
    return {
      ...empty,
      ok: status.reachable,
      latencyMs: status.latencyMs ?? 0,
      httpStatus: status.httpStatus,
      model: status.suggestedModel,
      error: status.error,
    };
  }

  // Not models[0]: list order is not a ranking, and trusting it recommended a
  // 512-token safety classifier as "best choice".
  // At most TWO attempts, and only when the provider refuses the model itself.
  // Mistral advertises models its own tier rejects and nothing in the
  // catalogue marks them, so one fallback turns an unusable reading into a
  // real one. It is capped rather than a loop: this endpoint spends quota,
  // and a retry that walks 56 models is a cost, not a recovery.
  const candidates = model ? [model] : (await probeProvider(def)).rankedModels.slice(0, MAX_TEST_CANDIDATES);
  if (candidates.length === 0) {
    return { ...empty, error: "no model available from this provider's catalogue to test with" };
  }

  let last: TestResult = empty;
  for (const [index, candidate] of candidates.entries()) {
    const startedAt = Date.now();
    try {
      const res = await fetch(def.inference.url(candidate), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(def.inference.body(candidate)),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const latencyMs = Date.now() - startedAt;
      const text = await res.text();
      const rateLimit = readRateLimit(def, res.headers);

      if (res.ok) {
        return {
          ...empty,
          ok: true,
          latencyMs,
          httpStatus: res.status,
          model: candidate,
          rateLimit,
          // Say so when the first choice was refused — otherwise the reading
          // silently belongs to a model the card never named.
          fellBackFrom: index > 0 ? candidates[0] : null,
        };
      }

      last = {
        ...empty,
        latencyMs,
        httpStatus: res.status,
        model: candidate,
        rateLimit,
        error: redact(text, key).slice(0, 300),
      };
      if (!isModelUnavailable(res.status, text)) return last;
    } catch (error) {
      last = {
        ...empty,
        latencyMs: Date.now() - startedAt,
        model: candidate,
        error: error instanceof Error ? redact(error.message, key) : "request failed",
      };
      return last;
    }
  }
  return last;
}

/**
 * The real mean token cost of a mission, from stored evidence.
 *
 * The spec supplied 92,000 tokens per mission. The missions actually on disk
 * average four orders of magnitude less, so that figure is not used: an
 * "estimated missions remaining" built on it would be a made-up number
 * wearing a real one's clothes. What is on disk is reported, with its sample
 * size, so a reader can see how much to trust it.
 */
export async function missionCostSample(): Promise<MissionCostSample> {
  try {
    const dir = join(DATA_DIR, "missions");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
    const totals: number[] = [];
    for (const file of files) {
      const raw = await readFile(join(dir, file), "utf8");
      for (const [, n] of raw.matchAll(/"totalTokens":\s*(\d+)/g)) totals.push(Number(n));
    }
    if (totals.length === 0) {
      return { meanTokens: null, sampleSize: 0, note: "no mission on disk has recorded token usage yet" };
    }
    const mean = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    return {
      meanTokens: mean,
      sampleSize: totals.length,
      note:
        `mean of ${totals.length} recorded mission${totals.length === 1 ? "" : "s"} on this machine. ` +
        "Every one so far is a single-step chat against a local model, so this is a floor, not a forecast.",
    };
  } catch {
    return { meanTokens: null, sampleSize: 0, note: "mission store not readable on this deployment" };
  }
}

export async function probeAll(): Promise<ProviderStatus[]> {
  return Promise.all(PROVIDERS.map(probeProvider));
}
