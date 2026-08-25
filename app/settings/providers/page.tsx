import type { Metadata } from "next";
import Link from "next/link";
import ProvidersPanel, { type StatusPayload } from "@/components/settings/ProvidersPanel";
import { probeAll, missionCostSample } from "@/lib/providers/probe";
import { probeOmniRoute } from "@/lib/providers/omniroute";

/**
 * Settings → Model Providers.
 *
 * The first read happens on the server, by calling the same functions the
 * status route calls — not by fetching our own HTTP endpoint. One less hop,
 * and the page paints with real data instead of a spinner that resolves into
 * numbers a moment later.
 *
 * Provider keys are read here and never leave the server unmasked.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Model providers — OPTIMUS",
  description: "Live status, measured rate limits and routing for every connected AI provider.",
};

export default async function ProvidersSettingsPage() {
  const [providers, omniroute, missionCost] = await Promise.all([
    probeAll(),
    probeOmniRoute(),
    missionCostSample(),
  ]);

  const measurable = providers.filter((p) => p.usageSource === "inference-headers" && p.reachable);
  const initial: StatusPayload = {
    observedAt: new Date().toISOString(),
    providers,
    omniroute,
    missionCost,
    pool: {
      measuredProviders: measurable.length,
      unmeasuredProviders: providers.length - measurable.length,
      note:
        "Pool totals need per-provider limits, and no catalogue endpoint returns them. " +
        "Run the connection tests to populate this from measured values.",
    },
  };

  return (
    <main className="min-h-dvh bg-mist">
      <nav className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-3.5 sm:px-8">
          <Link href="/chat" className="font-data text-[11.5px] text-body transition-colors hover:text-ink">
            ← Back to OPTIMUS
          </Link>
        </div>
      </nav>
      <ProvidersPanel initial={initial} />
    </main>
  );
}
