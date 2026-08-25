import "server-only";

/**
 * OmniRoute's own view: which models it can currently route to, and how many
 * requests have actually gone through it.
 *
 * Deliberately independent of the provider probes. The page must work with
 * OmniRoute stopped — a dead gateway makes the routing section unavailable,
 * it does not make Groq's status unknown.
 *
 * Note what this section can and cannot answer. OmniRoute counts what IT
 * routed; a provider counts what IT served. They are different numbers and
 * are labelled as such. Nowhere is OmniRoute's request count presented as a
 * provider's usage — that conflation is exactly how a dashboard ends up
 * confidently wrong.
 */

const BASE = process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128";
const TIMEOUT_MS = 8_000;

export interface OmniRouteUsage {
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  successfulRequests: number;
  successRatePct: number;
  avgLatencyMs: number;
  firstRequest: string | null;
  lastRequest: string | null;
}

export interface OmniRouteStatus {
  reachable: boolean;
  baseUrl: string;
  /** Separate from `reachable`: it can be up but refuse an unauthenticated call. */
  authenticated: boolean;
  modelCount: number | null;
  /** A handful, for display. Not the whole 286. */
  sampleModels: string[];
  usage: OmniRouteUsage | null;
  /** Why usage is absent, when it is. */
  usageNote: string | null;
  error: string | null;
  latencyMs: number | null;
}

export async function probeOmniRoute(): Promise<OmniRouteStatus> {
  const token = process.env.ANTHROPIC_AUTH_TOKEN?.trim();
  const base: OmniRouteStatus = {
    reachable: false,
    baseUrl: BASE,
    authenticated: false,
    modelCount: null,
    sampleModels: [],
    usage: null,
    usageNote: null,
    error: null,
    latencyMs: null,
  };

  const startedAt = Date.now();
  try {
    const ping = await fetch(`${BASE}/api/health/ping`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!ping.ok) {
      return { ...base, latencyMs: Date.now() - startedAt, error: `health ping returned HTTP ${ping.status}` };
    }
  } catch {
    return {
      ...base,
      latencyMs: Date.now() - startedAt,
      error: `no OmniRoute reachable at ${BASE} — provider status below is unaffected`,
    };
  }

  const withPing: OmniRouteStatus = { ...base, reachable: true, latencyMs: Date.now() - startedAt };
  if (!token) {
    return { ...withPing, error: "ANTHROPIC_AUTH_TOKEN is not set, so the model catalogue cannot be read" };
  }

  try {
    const res = await fetch(`${BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      // The exact failure the .env comment used to hide: an invented token
      // is refused here, and saying so beats a generic "not connected".
      return {
        ...withPing,
        error:
          res.status === 401
            ? "OmniRoute refused the token. It validates against its own database — a key must be minted via POST /api/keys, not invented."
            : `HTTP ${res.status}: ${text.slice(0, 160)}`,
      };
    }
    const parsed = JSON.parse(text) as { data?: Array<{ id?: string }> };
    const models = (parsed.data ?? []).map((m) => m.id).filter((v): v is string => Boolean(v));
    const authed: OmniRouteStatus = {
      ...withPing,
      authenticated: true,
      modelCount: models.length,
      sampleModels: models.slice(0, 6),
    };
    return { ...authed, ...(await usageFor(authed)) };
  } catch (error) {
    return { ...withPing, error: error instanceof Error ? error.message : "model catalogue request failed" };
  }
}

/**
 * Usage analytics need a dashboard session, not an API key. We only attempt
 * it when OMNIROUTE_PASSWORD is deliberately set; otherwise the section says
 * why it is empty rather than showing zeroes that look like "no traffic".
 */
async function usageFor(status: OmniRouteStatus): Promise<Pick<OmniRouteStatus, "usage" | "usageNote">> {
  const password = process.env.OMNIROUTE_PASSWORD?.trim();
  if (!password) {
    return {
      usage: null,
      usageNote:
        "OmniRoute's request counts need a dashboard session. Set OMNIROUTE_PASSWORD to let this page log in and read them.",
    };
  }
  try {
    const login = await fetch(`${status.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!login.ok) return { usage: null, usageNote: `OmniRoute rejected OMNIROUTE_PASSWORD (HTTP ${login.status})` };

    const cookie = login.headers.getSetCookie?.().join("; ") ?? login.headers.get("set-cookie") ?? "";
    const res = await fetch(`${status.baseUrl}/api/usage/analytics`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { usage: null, usageNote: `usage analytics returned HTTP ${res.status}` };

    const { summary } = (await res.json()) as { summary?: Record<string, number | string | null> };
    if (!summary) return { usage: null, usageNote: "usage analytics returned no summary" };

    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    return {
      usage: {
        totalRequests: num(summary.totalRequests),
        totalTokens: num(summary.totalTokens),
        promptTokens: num(summary.promptTokens),
        completionTokens: num(summary.completionTokens),
        successfulRequests: num(summary.successfulRequests),
        successRatePct: num(summary.successRatePct),
        avgLatencyMs: num(summary.avgLatencyMs),
        firstRequest: typeof summary.firstRequest === "string" ? summary.firstRequest : null,
        lastRequest: typeof summary.lastRequest === "string" ? summary.lastRequest : null,
      },
      usageNote: null,
    };
  } catch (error) {
    return { usage: null, usageNote: error instanceof Error ? error.message : "usage analytics unreachable" };
  }
}
