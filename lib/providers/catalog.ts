import "server-only";

/**
 * What each provider ACTUALLY exposes — established by probing the live APIs
 * with real keys on 2026-08-25, not by reading marketing docs.
 *
 * The single most important fact on this page, and the reason its shape is
 * what it is:
 *
 *   NONE of the three /models endpoints returns a rate-limit header.
 *   Groq and Mistral return real limits only on an INFERENCE call.
 *   Gemini returns none, anywhere.
 *
 * Measured (see the probe output quoted per provider below):
 *
 *   Groq    GET /openai/v1/models        → 200, 13 models, 0 rate-limit headers
 *           POST /openai/v1/chat/...     → 200, 6 rate-limit headers
 *   Mistral GET /v1/models               → 200, 56 models, 0 rate-limit headers
 *           POST /v1/chat/completions    → 200, 5 rate-limit headers
 *   Gemini  GET /v1beta/models           → 200, 50 models, 0 rate-limit headers
 *           POST :generateContent        → 0 rate-limit headers
 *
 * This is why usage is harvested by an explicit "Test connection" and not by
 * a 60-second poll: the only way to read a provider's remaining quota is to
 * spend some of it. A poll that consumes the thing it reports on would make
 * the number it shows a function of the page being open.
 */

export type UsageSource =
  /** Real limit + remaining headers, returned on an inference call only. */
  | "inference-headers"
  /** The provider publishes nothing readable. Say so; never draw a bar. */
  | "none";

/** What we can say about one model, using only fields the provider sent. */
export interface ModelInfo {
  id: string;
  /** Provider-reported context window. Null when the provider omits it. */
  contextWindow: number | null;
  /** Provider-reported deprecation. A deprecated model is a poor test target. */
  deprecated: boolean;
  /**
   * Other ids the provider says are THE SAME model. Mistral publishes these,
   * and ignoring them made a two-candidate fallback try one model twice:
   * `glm-5-2` and `zai-glm-5-2` are one model with two names, so a refusal of
   * the first guaranteed a refusal of the "next" one.
   */
  aliases: string[];
  /**
   * Whether the provider says this model does text chat. Derived ONLY from
   * fields it returns — never from the model's name. Null means it did not
   * say, and an unstated capability is not assumed either way.
   */
  chatCapable: boolean | null;
}

export interface ProviderDef {
  id: string;
  name: string;
  /** Env var holding the key. Read server-side only, never returned. */
  envVar: string;
  /** Cheap reachability + catalogue. No quota is consumed. */
  modelsUrl: string;
  /** How the key is presented. Gemini uses a query param, not a header. */
  auth: "bearer" | "query";
  /** Where the model array lives in the response. */
  modelsPath: "data" | "models";
  usageSource: UsageSource;
  /** Why, in the UI's own words, when usageSource is "none". */
  usageNote?: string;
  /**
   * Reads one raw model object into our shape. Each provider publishes
   * different fields, so this is per-provider rather than a shared guess:
   *   Groq     context_window + output_modalities
   *   Mistral  capabilities.completion_chat
   *   Gemini   inputTokenLimit + supportedGenerationMethods
   * Every one of those is returned by the live API. None is inferred from a
   * model's name, which is the tempting shortcut and the wrong one — a name
   * is marketing, a capability flag is the provider's own answer.
   */
  describeModel: (raw: Record<string, unknown>) => ModelInfo | null;
  /** Endpoint used by an explicit connection test. */
  inference?: {
    url: (model: string) => string;
    body: (model: string) => unknown;
  };
  /**
   * Header names to read, mapped to our shape. Recorded per provider because
   * they genuinely differ — Groq reports a window total, Mistral reports
   * per-minute, and assuming one shape for both would invent numbers.
   */
  headerMap?: {
    limitRequests: string;
    remainingRequests: string;
    limitTokens: string;
    remainingTokens: string;
    resetRequests?: string;
    resetTokens?: string;
    /** The window the numbers describe, as the provider defines it. */
    window: string;
  };
}

export const PROVIDERS: readonly ProviderDef[] = [
  {
    id: "groq",
    name: "Groq",
    envVar: "GROQ_API_KEY",
    modelsUrl: "https://api.groq.com/openai/v1/models",
    auth: "bearer",
    modelsPath: "data",
    usageSource: "inference-headers",
    describeModel: (raw) => {
      const id = typeof raw.id === "string" ? raw.id : null;
      if (!id) return null;
      const out = Array.isArray(raw.output_modalities) ? (raw.output_modalities as string[]) : null;
      return {
        id,
        contextWindow: typeof raw.context_window === "number" ? raw.context_window : null,
        deprecated: raw.active === false,
        aliases: [],
        // Groq lists speech models (Orpheus TTS) and audio models (Whisper)
        // in the same catalogue. It says so in output_modalities, so we read
        // that rather than pattern-matching names.
        chatCapable: out ? out.includes("text") : null,
      };
    },
    inference: {
      url: () => "https://api.groq.com/openai/v1/chat/completions",
      body: (model) => ({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    },
    // Measured: x-ratelimit-limit-requests: 1000 · remaining: 999 ·
    // limit-tokens: 8000 · remaining: 7927 · reset-requests: "1m26.4s"
    headerMap: {
      limitRequests: "x-ratelimit-limit-requests",
      remainingRequests: "x-ratelimit-remaining-requests",
      limitTokens: "x-ratelimit-limit-tokens",
      remainingTokens: "x-ratelimit-remaining-tokens",
      resetRequests: "x-ratelimit-reset-requests",
      resetTokens: "x-ratelimit-reset-tokens",
      window: "rolling window, as reported by Groq",
    },
  },
  {
    id: "mistral",
    name: "Mistral",
    envVar: "MISTRAL_API_KEY",
    modelsUrl: "https://api.mistral.ai/v1/models",
    auth: "bearer",
    modelsPath: "data",
    usageSource: "inference-headers",
    describeModel: (raw) => {
      const id = typeof raw.id === "string" ? raw.id : null;
      if (!id) return null;
      const caps = raw.capabilities as { completion_chat?: unknown } | undefined;
      return {
        id,
        contextWindow:
          typeof raw.max_context_length === "number"
            ? raw.max_context_length
            : typeof raw.context_length === "number"
              ? raw.context_length
              : null,
        deprecated: raw.deprecation != null,
        aliases: Array.isArray(raw.aliases) ? (raw.aliases as string[]).filter((a) => typeof a === "string") : [],
        // Mistral answers this directly. Nothing to infer.
        chatCapable: typeof caps?.completion_chat === "boolean" ? caps.completion_chat : null,
      };
    },
    inference: {
      url: () => "https://api.mistral.ai/v1/chat/completions",
      body: (model) => ({ model, messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
    },
    // Measured: x-ratelimit-limit-req-minute: 50 · remaining-req-minute: 49 ·
    // limit-tokens-minute: 50000 · remaining-tokens-minute: 49983
    headerMap: {
      limitRequests: "x-ratelimit-limit-req-minute",
      remainingRequests: "x-ratelimit-remaining-req-minute",
      limitTokens: "x-ratelimit-limit-tokens-minute",
      remainingTokens: "x-ratelimit-remaining-tokens-minute",
      // Mistral sends no reset header. The window is per-minute, so a reset
      // instant could be derived — but derived is not reported, and this
      // page does not present the two as the same thing.
      window: "per minute",
    },
  },
  {
    id: "gemini",
    name: "Gemini",
    envVar: "GEMINI_API_KEY",
    modelsUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    auth: "query",
    modelsPath: "models",
    usageSource: "none",
    describeModel: (raw) => {
      const id = typeof raw.name === "string" ? raw.name : null;
      if (!id) return null;
      const methods = Array.isArray(raw.supportedGenerationMethods)
        ? (raw.supportedGenerationMethods as string[])
        : null;
      return {
        id,
        contextWindow: typeof raw.inputTokenLimit === "number" ? raw.inputTokenLimit : null,
        deprecated: false, // Gemini publishes no deprecation flag on this endpoint
        aliases: [],
        chatCapable: methods ? methods.includes("generateContent") : null,
      };
    },
    usageNote:
      "Google returns no rate-limit headers on either the model list or a " +
      "generateContent call. Quota is only visible through Cloud Monitoring, " +
      "which needs a GCP project this key is not tied to.",
  },
] as const;

/**
 * `gsk_••••••••••3r763` — first 4 and last 5, per the spec. Applied
 * server-side; an unmasked key never enters a response body.
 *
 * Short keys are NOT partially revealed: showing 9 of 12 characters would
 * defeat the point, so anything that cannot spare the middle is fully masked.
 */
/**
 * The model a connection test should use, chosen from the provider's own
 * catalogue by its own reported fields.
 *
 * List order is NOT a ranking, and taking `models[0]` produced a real defect:
 * the page recommended `meta-llama/llama-prompt-guard-2-22m` — a 512-token
 * safety classifier — as the best choice, purely because Groq happened to
 * return it first. Ranking by reported context window, among models the
 * provider says do text chat, uses only live data and answers the question
 * actually being asked.
 */
export function rankChatModels(models: readonly ModelInfo[]): ModelInfo[] {
  const usable = models.filter((m) => m.chatCapable !== false && !m.deprecated);
  const pool = usable.length > 0 ? usable : models.filter((m) => !m.deprecated);
  const fallback = pool.length > 0 ? pool : models;
  // Tie-break by id, deliberately. Groq returns groq/compound and
  // openai/gpt-oss-120b with an IDENTICAL 131,072 window, and a sort with no
  // tie-break left them in whatever order the API happened to return — so the
  // card advertised one model and the test measured the other. A page whose
  // own two halves disagree is the defect this whole screen is about.
  const sorted = [...fallback].sort(
    (a, b) => (b.contextWindow ?? -1) - (a.contextWindow ?? -1) || a.id.localeCompare(b.id),
  );

  // Collapse aliases, so a fallback reaches a genuinely DIFFERENT model.
  const seen = new Set<string>();
  const unique: ModelInfo[] = [];
  for (const model of sorted) {
    if (seen.has(model.id)) continue;
    unique.push(model);
    seen.add(model.id);
    for (const alias of model.aliases) seen.add(alias);
  }
  return unique;
}

export function pickChatModel(models: readonly ModelInfo[]): ModelInfo | null {
  return rankChatModels(models)[0] ?? null;
}

/**
 * A provider refusing a model it just advertised.
 *
 * Mistral lists `glm-5-2` with `completion_chat: true`, `deprecation: null`
 * and a 1,048,576 window, then answers 403 `tier_not_allowed` for it. Nothing
 * in the catalogue distinguishes it, so this cannot be predicted — only
 * recovered from, once, with the next candidate.
 */
export function isModelUnavailable(status: number | null, body: string): boolean {
  if (status !== 403 && status !== 404) return false;
  // 404 on a chat endpoint is always about the model — the route itself exists.
  if (status === 404) return true;

  // For 403 the predicate is INVERTED deliberately. An allow-list of message
  // strings turned into whack-a-mole against one provider's catalogue:
  //   "This model is not available in your subscription tier"  (tier_not_allowed)
  //   "Model labs-leanstral-1-5 is a Labs model. To use Labs models, an
  //    admin must enable them…"
  // Both are the same fact — this key may not call THIS model — and the next
  // catalogue entry will phrase it a third way. So: a 403 is treated as a
  // model-entitlement problem unless it names an account-level failure, which
  // no other model would fix and which must NOT be retried.
  // Leading word boundary only — these are STEMS. A trailing \b would fail on
  // "suspended", "authenticated", "quotas", which is exactly the wording real
  // providers use.
  return !/\b(api[_ -]?key|unauthor|authenticat|credential|billing|payment|invoice|suspend|quota|rate[_ -]?limit|too many requests)/i.test(
    body,
  );
}

export function maskKey(key: string): string {
  if (key.length < 16) return "•".repeat(Math.max(key.length, 8));
  return `${key.slice(0, 4)}${"•".repeat(10)}${key.slice(-5)}`;
}
