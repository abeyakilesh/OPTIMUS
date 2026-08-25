import { NextResponse } from "next/server";
import { probeAll, missionCostSample, type ProviderStatus } from "@/lib/providers/probe";
import { probeOmniRoute } from "@/lib/providers/omniroute";

/**
 * GET /api/providers/status — the cheap half.
 *
 * Key presence, catalogue reachability, OmniRoute health. **No quota is
 * consumed**, which is why it is safe to auto-refresh. The expensive half —
 * the only place real rate limits exist — is POST /api/providers/test, run
 * on demand.
 *
 * Provider probes and the OmniRoute probe are settled independently on
 * purpose: a stopped gateway must not blank out Groq's status.
 */

export const dynamic = "force-dynamic";

export interface PoolSummary {
  /** Only providers that actually reported limits contribute. */
  measuredProviders: number;
  unmeasuredProviders: number;
  note: string;
}

export interface ProvidersStatusResponse {
  ok: true;
  observedAt: string;
  providers: ProviderStatus[];
  omniroute: Awaited<ReturnType<typeof probeOmniRoute>>;
  missionCost: Awaited<ReturnType<typeof missionCostSample>>;
  pool: PoolSummary;
}

export async function GET() {
  const [providers, omniroute, missionCost] = await Promise.all([
    probeAll(),
    probeOmniRoute(),
    missionCostSample(),
  ]);

  const measurable = providers.filter((p) => p.usageSource === "inference-headers" && p.reachable);
  const pool: PoolSummary = {
    measuredProviders: measurable.length,
    unmeasuredProviders: providers.length - measurable.length,
    // The totals the spec asked for at the top of the page cannot be computed
    // from this call at all: no /models endpoint returns a quota. Saying so
    // is the honest version of a headline number.
    note:
      "Pool totals need per-provider limits, and no catalogue endpoint returns them. " +
      "Run the connection tests to populate this from measured values.",
  };

  return NextResponse.json({
    ok: true,
    observedAt: new Date().toISOString(),
    providers,
    omniroute,
    missionCost,
    pool,
  } satisfies ProvidersStatusResponse);
}
