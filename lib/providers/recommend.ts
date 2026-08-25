/**
 * "Which model should I use right now."
 *
 * Shared by the route and the client, and deliberately NOT server-only: the
 * client recomputes it from the same test results it displays, so the advice
 * and the evidence on screen can never disagree.
 *
 * Two rules it will not break:
 *
 *  1. It only ranks providers whose limits were actually MEASURED. A provider
 *     that publishes no quota is not "assumed healthy" — it is excluded, and
 *     the reason is stated.
 *  2. It only ever names a model the provider's own live catalogue returned.
 *     The spec's worked example suggested `llama-3.3-70b-versatile`; this Groq
 *     account answers 404 for it. A recommendation naming a model the account
 *     cannot call is worse than no recommendation.
 */

export interface RankInput {
  id: string;
  name: string;
  /** From a real inference test. Null means never measured. */
  remainingRequests: number | null;
  limitRequests: number | null;
  remainingTokens: number | null;
  limitTokens: number | null;
  /** Measured round-trip of the test call. */
  latencyMs: number | null;
  /** The model the test actually used — from the provider's live catalogue. */
  model: string | null;
  usageMeasurable: boolean;
}

export interface Recommendation {
  providerId: string;
  providerName: string;
  model: string;
  reason: string;
  headroomPct: number;
  latencyMs: number | null;
}

export interface RecommendationResult {
  best: Recommendation | null;
  /** Why there is no answer, when there isn't. Never left blank. */
  reason: string;
  /** Providers deliberately left out of the ranking, and why. */
  excluded: Array<{ name: string; why: string }>;
}

export function fractionRemaining(remaining: number | null, limit: number | null): number | null {
  if (remaining === null || limit === null || limit <= 0) return null;
  return Math.max(0, Math.min(1, remaining / limit));
}

export function recommend(inputs: readonly RankInput[]): RecommendationResult {
  const excluded: Array<{ name: string; why: string }> = [];
  const ranked: Array<Recommendation & { score: number }> = [];

  for (const p of inputs) {
    if (!p.usageMeasurable) {
      excluded.push({ name: p.name, why: "publishes no usage data, so headroom cannot be measured" });
      continue;
    }
    if (!p.model) {
      excluded.push({ name: p.name, why: "no model returned by its live catalogue" });
      continue;
    }
    const reqFrac = fractionRemaining(p.remainingRequests, p.limitRequests);
    const tokFrac = fractionRemaining(p.remainingTokens, p.limitTokens);
    if (reqFrac === null && tokFrac === null) {
      excluded.push({ name: p.name, why: "not tested yet — run a connection test to measure its limits" });
      continue;
    }
    // The binding constraint is whichever is scarcer, not the average: a
    // provider with 99% of requests left and 2% of tokens left is at 2%.
    const headroom = Math.min(...[reqFrac, tokFrac].filter((v): v is number => v !== null));
    // FLOOR, matching the bars exactly. When this rounded and the meter
    // floored, the page showed "100% of its tightest limit remaining" above a
    // bar reading 99% — the advice and its own evidence disagreeing on screen,
    // which is the one thing this component was written to prevent.
    const parts: string[] = [`${Math.floor(headroom * 100)}% of its tightest limit remaining`];
    if (p.latencyMs !== null) parts.push(`${p.latencyMs}ms measured round trip`);

    ranked.push({
      providerId: p.id,
      providerName: p.name,
      model: p.model,
      headroomPct: Math.floor(headroom * 100),
      latencyMs: p.latencyMs,
      reason: parts.join(" · "),
      score: headroom,
    });
  }

  if (ranked.length === 0) {
    return {
      best: null,
      reason:
        "No provider has measured limits yet. Limits are only returned on an inference call, " +
        "so run a connection test — nothing here is guessed from published tier documentation.",
      excluded,
    };
  }

  // Headroom first; a measured latency breaks ties. Both are observed values.
  ranked.sort((a, b) => b.score - a.score || (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));
  const [best] = ranked;
  return {
    best: { ...best },
    reason: `${ranked.length} provider${ranked.length === 1 ? "" : "s"} with measured limits ranked by tightest-constraint headroom.`,
    excluded,
  };
}
