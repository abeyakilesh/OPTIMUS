import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  isModelUnavailable,
  maskKey,
  pickChatModel,
  rankChatModels,
  PROVIDERS,
  type ModelInfo,
} from "../../lib/providers/catalog";
import { parseResetDuration, readRateLimit, probeProvider, testProvider } from "../../lib/providers/probe";
import { recommend, fractionRemaining, type RankInput } from "../../lib/providers/recommend";

/**
 * The rule this page is built around: every number comes from a real API
 * call. These tests exist mostly to prove the NEGATIVE half of that — that
 * absent data stays absent instead of being filled in with something
 * plausible, and that a key never travels back to a client.
 */

const REAL_KEY = "gsk_ABCDEFGHIJKLMNOPQRSTUVWXYZ3r763";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("maskKey", () => {
  it("shows first 4 and last 5, per the spec", () => {
    expect(maskKey(REAL_KEY)).toBe("gsk_••••••••••3r763");
  });

  it("never returns any middle character of the key", () => {
    const masked = maskKey(REAL_KEY);
    const middle = REAL_KEY.slice(4, -5);
    for (const chunk of [middle, middle.slice(0, 8), middle.slice(-8)]) {
      expect(masked).not.toContain(chunk);
    }
  });

  it("fully masks a short key rather than revealing most of it", () => {
    // 4 + 5 of a 12-char key is 9 of 12 characters — a mask that isn't one.
    const masked = maskKey("sk-tooshort1");
    expect(masked).toMatch(/^•+$/);
    expect(masked).not.toContain("sk-t");
  });
});

describe("parseResetDuration", () => {
  it("parses the compound form Groq actually sends", () => {
    // Measured live: x-ratelimit-reset-requests: "1m26.4s"
    expect(parseResetDuration("1m26.4s")).toBe(86_400);
    expect(parseResetDuration("547ms")).toBe(547);
    expect(parseResetDuration("2h30m")).toBe(9_000_000);
  });

  it("returns null for something it cannot parse, rather than 0", () => {
    // 0 would render as "resets now", which is a claim. null renders as
    // "not reported", which is the truth.
    expect(parseResetDuration("soon")).toBeNull();
    expect(parseResetDuration("")).toBeNull();
  });
});

describe("readRateLimit", () => {
  const groq = PROVIDERS.find((p) => p.id === "groq")!;
  const mistral = PROVIDERS.find((p) => p.id === "mistral")!;
  const gemini = PROVIDERS.find((p) => p.id === "gemini")!;

  it("reads the exact headers Groq returned in the live probe", () => {
    const headers = new Headers({
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "999",
      "x-ratelimit-limit-tokens": "8000",
      "x-ratelimit-remaining-tokens": "7927",
      "x-ratelimit-reset-requests": "1m26.4s",
    });
    const rl = readRateLimit(groq, headers, 1_000_000)!;
    expect(rl.limitRequests).toBe(1000);
    expect(rl.remainingRequests).toBe(999);
    expect(rl.remainingTokens).toBe(7927);
    expect(rl.resetRequestsRaw).toBe("1m26.4s");
    expect(rl.resetRequestsAt).toBe(new Date(1_000_000 + 86_400).toISOString());
  });

  it("reads Mistral's DIFFERENT header names — the two are not interchangeable", () => {
    // Mistral reports per-minute under -req-minute names. Reusing Groq's map
    // here would silently produce nulls that look like "no quota reported".
    const rl = readRateLimit(
      mistral,
      new Headers({
        "x-ratelimit-limit-req-minute": "50",
        "x-ratelimit-remaining-req-minute": "49",
        "x-ratelimit-limit-tokens-minute": "50000",
        "x-ratelimit-remaining-tokens-minute": "49983",
      }),
    )!;
    expect(rl.limitRequests).toBe(50);
    expect(rl.remainingTokens).toBe(49_983);
    expect(rl.window).toBe("per minute");
    // Mistral sends no reset header — this must stay null, not be derived.
    expect(rl.resetRequestsAt).toBeNull();
  });

  it("returns null when a provider sends no rate-limit headers at all", () => {
    // The live Gemini case, and the live /models case for all three.
    expect(readRateLimit(groq, new Headers({ "content-type": "application/json" }))).toBeNull();
    expect(gemini.headerMap).toBeUndefined();
  });
});

describe("a key never reaches the client", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", REAL_KEY);
  });

  it("masks it in a successful probe", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "openai/gpt-oss-20b" }] }), { status: 200 }),
    );
    const status = await probeProvider(PROVIDERS.find((p) => p.id === "groq")!);
    expect(JSON.stringify(status)).not.toContain(REAL_KEY);
    expect(status.maskedKey).toBe("gsk_••••••••••3r763");
  });

  it("strips it even when the provider ECHOES the key back in an error body", async () => {
    // Real providers do this. Passing the body through verbatim would leak
    // the credential into a response that the browser then renders.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`{"error":"invalid key ${REAL_KEY} rejected"}`, { status: 401 }),
    );
    const status = await probeProvider(PROVIDERS.find((p) => p.id === "groq")!);
    expect(status.error).toContain("«redacted»");
    expect(JSON.stringify(status)).not.toContain(REAL_KEY);
  });

  it("strips it from a thrown error message too", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error(`connect failed for key=${REAL_KEY}`));
    const status = await probeProvider(PROVIDERS.find((p) => p.id === "groq")!);
    expect(JSON.stringify(status)).not.toContain(REAL_KEY);
  });

  it("sends the key to Gemini as a query param without returning the URL", async () => {
    vi.stubEnv("GEMINI_API_KEY", REAL_KEY);
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ models: [{ name: "models/gemini-3.6-flash" }] }), { status: 200 }));
    const status = await probeProvider(PROVIDERS.find((p) => p.id === "gemini")!);
    // The key IS in the outbound URL — that is Google's auth scheme — but it
    // must not come back in anything we serialise.
    expect(String(spy.mock.calls[0][0])).toContain(REAL_KEY);
    expect(JSON.stringify(status)).not.toContain(REAL_KEY);
  });
});

describe("absent data stays absent", () => {
  it("reports a missing env var instead of showing a disconnected-looking card with no reason", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "");
    const status = await probeProvider(PROVIDERS.find((p) => p.id === "mistral")!);
    expect(status.keyPresent).toBe(false);
    expect(status.maskedKey).toBeNull();
    expect(status.error).toBe("MISTRAL_API_KEY is not set");
  });

  it("carries Gemini's stated reason rather than an empty usage section", () => {
    const gemini = PROVIDERS.find((p) => p.id === "gemini")!;
    expect(gemini.usageSource).toBe("none");
    expect(gemini.usageNote).toMatch(/no rate-limit headers/i);
  });

  it("refuses to test a provider with no key, without calling out", async () => {
    vi.stubEnv("GROQ_API_KEY", "");
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await testProvider(PROVIDERS.find((p) => p.id === "groq")!);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not set/);
    expect(spy, "no network call should be attempted without a key").not.toHaveBeenCalled();
  });
});

describe("fractionRemaining", () => {
  it("is null when either side is unmeasured — never 0, never 1", () => {
    // A bar drawn at 0% and a bar that could not be drawn look identical to a
    // reader. Only one of them is a fact.
    expect(fractionRemaining(null, 100)).toBeNull();
    expect(fractionRemaining(50, null)).toBeNull();
    expect(fractionRemaining(50, 0)).toBeNull();
    expect(fractionRemaining(50, 100)).toBe(0.5);
  });
});

describe("pickChatModel — list order is not a ranking", () => {
  const m = (
    id: string,
    contextWindow: number | null,
    chatCapable: boolean | null,
    deprecated = false,
    aliases: string[] = [],
  ): ModelInfo => ({ id, contextWindow, chatCapable, deprecated, aliases });

  it("does not pick a 512-token safety classifier just because it is first", () => {
    // The exact defect this replaced: the page recommended
    // meta-llama/llama-prompt-guard-2-22m as "best choice right now".
    const picked = pickChatModel([
      m("meta-llama/llama-prompt-guard-2-22m", 512, true),
      m("openai/gpt-oss-120b", 131_072, true),
    ]);
    expect(picked?.id).toBe("openai/gpt-oss-120b");
  });

  it("excludes models the provider says are not text-chat", () => {
    // Groq lists Whisper (audio) and Orpheus (speech) in the same catalogue,
    // and says so in output_modalities.
    const picked = pickChatModel([
      m("canopylabs/orpheus-v1-english", 4000, false),
      m("qwen/qwen3.6-27b", 131_072, true),
    ]);
    expect(picked?.id).toBe("qwen/qwen3.6-27b");
  });

  it("keeps models whose capability the provider never stated", () => {
    // null is "unstated", not "incapable" — dropping those would silently
    // empty the pool for a provider that publishes no flags at all.
    expect(pickChatModel([m("unknown", 8000, null)])?.id).toBe("unknown");
  });

  it("falls back rather than returning nothing when every model is excluded", () => {
    expect(pickChatModel([m("only-one", 448, false)])?.id).toBe("only-one");
  });

  it("returns null for an empty catalogue instead of throwing", () => {
    expect(pickChatModel([])).toBeNull();
  });

  it("breaks a context-window tie deterministically, so two renders agree", () => {
    // Groq returns groq/compound and openai/gpt-oss-120b with an IDENTICAL
    // 131,072 window. Without a tie-break the card advertised one and the
    // test measured the other — the page disagreeing with itself.
    const a = [m("groq/compound", 131_072, true), m("openai/gpt-oss-120b", 131_072, true)];
    const b = [m("openai/gpt-oss-120b", 131_072, true), m("groq/compound", 131_072, true)];
    expect(pickChatModel(a)?.id).toBe(pickChatModel(b)?.id);
    expect(pickChatModel(a)?.id).toBe("groq/compound");
  });

  it("skips a model the provider marked deprecated", () => {
    const picked = pickChatModel([
      m("old-but-huge", 1_000_000, true, true),
      m("current", 32_000, true, false),
    ]);
    expect(picked?.id).toBe("current");
  });

  it("ranks rather than picking one, so a refused model has a successor", () => {
    const ranked = rankChatModels([m("small", 8_000, true), m("big", 128_000, true)]);
    expect(ranked.map((r) => r.id)).toEqual(["big", "small"]);
  });

  it("collapses aliases, so a fallback reaches a genuinely different model", () => {
    // The live defect: Mistral ranks glm-5-2 and zai-glm-5-2 first and second,
    // and publishes aliases:["zai-glm-5-2"] saying they are ONE model. A
    // two-candidate fallback therefore tried the same tier-locked model twice
    // and reported failure as though two models had been refused.
    const ranked = rankChatModels([
      m("glm-5-2", 1_048_576, true, false, ["zai-glm-5-2"]),
      m("zai-glm-5-2", 1_048_576, true),
      m("labs-leanstral-1-5", 262_144, true),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["glm-5-2", "labs-leanstral-1-5"]);
  });

  it("Mistral's real catalogue publishes the aliases this relies on", () => {
    const def = PROVIDERS.find((p) => p.id === "mistral")!;
    expect(def.describeModel({ id: "glm-5-2", aliases: ["zai-glm-5-2"] })?.aliases).toEqual(["zai-glm-5-2"]);
    // Providers that publish none must yield [], not undefined.
    expect(PROVIDERS.find((p) => p.id === "groq")!.describeModel({ id: "x" })?.aliases).toEqual([]);
  });
});

describe("isModelUnavailable — the one failure worth retrying", () => {
  it("recognises Mistral's real tier refusal", () => {
    // Verbatim from the live 403: glm-5-2 is advertised with
    // completion_chat:true, deprecation:null and a 1,048,576 window.
    const body = '{"object":"error","message":"This model is not available in your subscription tier","type":"tier_not_allowed","code":"1910"}';
    expect(isModelUnavailable(403, body)).toBe(true);
  });

  it("recognises Groq's model_not_found", () => {
    expect(isModelUnavailable(404, '{"error":{"code":"model_not_found"}}')).toBe(true);
  });

  it("recognises Mistral's OTHER refusal, phrased completely differently", () => {
    // Same fact, third wording — which is why the predicate is inverted rather
    // than an allow-list of message strings.
    const body = '{"message":"Model labs-leanstral-1-5 is a Labs model. To use Labs models, an admin must enable them in the workspace settings."}';
    expect(isModelUnavailable(403, body)).toBe(true);
  });

  it("does NOT retry a rate limit, an auth failure, or a server error", () => {
    // Retrying those spends quota to learn the same thing twice, and no other
    // model would succeed where these failed.
    expect(isModelUnavailable(429, "rate limit exceeded")).toBe(false);
    expect(isModelUnavailable(401, "invalid api key")).toBe(false);
    expect(isModelUnavailable(500, "internal error")).toBe(false);
    expect(isModelUnavailable(null, "no response")).toBe(false);
  });

  it("does NOT retry an ACCOUNT-level 403, which no other model would fix", () => {
    for (const body of [
      '{"message":"billing disabled for this account"}',
      '{"message":"invalid api_key supplied"}',
      '{"message":"your quota has been exhausted"}',
      '{"message":"payment required — update your card"}',
      '{"message":"account suspended"}',
    ]) {
      expect(isModelUnavailable(403, body), body).toBe(false);
    }
  });
});

describe("every provider reads its own real capability fields", () => {
  it("Groq: context_window + output_modalities", () => {
    const def = PROVIDERS.find((p) => p.id === "groq")!;
    expect(def.describeModel({ id: "x", context_window: 131072, output_modalities: ["text"], active: true })).toEqual({
      id: "x",
      contextWindow: 131072,
      deprecated: false,
      aliases: [],
      chatCapable: true,
    });
    // Groq marks a retired model with active:false.
    expect(def.describeModel({ id: "x", active: false })?.deprecated).toBe(true);
    expect(def.describeModel({ id: "tts", context_window: 4000, output_modalities: ["speech"] })?.chatCapable).toBe(false);
  });

  it("Mistral: capabilities.completion_chat + deprecation", () => {
    const def = PROVIDERS.find((p) => p.id === "mistral")!;
    expect(def.describeModel({ id: "m", capabilities: { completion_chat: true } })?.chatCapable).toBe(true);
    expect(def.describeModel({ id: "m", capabilities: { completion_chat: false } })?.chatCapable).toBe(false);
    expect(def.describeModel({ id: "m", deprecation: null })?.deprecated).toBe(false);
    expect(def.describeModel({ id: "m", deprecation: "2026-01-01" })?.deprecated).toBe(true);
  });

  it("Gemini: inputTokenLimit + supportedGenerationMethods", () => {
    const def = PROVIDERS.find((p) => p.id === "gemini")!;
    const got = def.describeModel({
      name: "models/gemini-2.5-flash",
      inputTokenLimit: 1_048_576,
      supportedGenerationMethods: ["generateContent"],
    });
    expect(got).toEqual({
      id: "models/gemini-2.5-flash",
      contextWindow: 1_048_576,
      deprecated: false,
      aliases: [],
      chatCapable: true,
    });
    expect(def.describeModel({ name: "e", supportedGenerationMethods: ["embedContent"] })?.chatCapable).toBe(false);
  });

  it("never infers a capability from the model NAME", () => {
    // A name is marketing; a capability flag is the provider's own answer.
    const def = PROVIDERS.find((p) => p.id === "groq")!;
    expect(def.describeModel({ id: "definitely-a-chat-model" })?.chatCapable).toBeNull();
  });
});

describe("percentages are floored, never rounded up", () => {
  it("does not render 998/1000 as a full bar", () => {
    // Math.round(99.8) is 100, which draws a full bar while two requests are
    // already spent. Flooring keeps the number honest in the same direction
    // CLAUDE.md's "never round up" points.
    const frac = fractionRemaining(998, 1000)!;
    expect(Math.floor(frac * 100)).toBe(99);
    expect(Math.round(frac * 100)).toBe(100); // the value we deliberately do NOT use
  });

  it("floors Mistral's near-full token window too", () => {
    expect(Math.floor(fractionRemaining(374_995, 375_000)! * 100)).toBe(99);
  });
});

describe("recommend", () => {
  const measured = (over: Partial<RankInput> = {}): RankInput => ({
    id: "groq",
    name: "Groq",
    remainingRequests: 999,
    limitRequests: 1000,
    remainingTokens: 7927,
    limitTokens: 8000,
    latencyMs: 433,
    model: "openai/gpt-oss-20b",
    usageMeasurable: true,
    ...over,
  });

  it("gives no recommendation when nothing has been measured", () => {
    const r = recommend([measured({ remainingRequests: null, limitRequests: null, remainingTokens: null, limitTokens: null })]);
    expect(r.best).toBeNull();
    expect(r.reason).toMatch(/only returned on an inference call/i);
    expect(r.excluded[0].why).toMatch(/not tested yet/);
  });

  it("excludes a provider that publishes no usage, with the reason", () => {
    const r = recommend([measured({ id: "gemini", name: "Gemini", usageMeasurable: false })]);
    expect(r.best).toBeNull();
    expect(r.excluded).toEqual([{ name: "Gemini", why: "publishes no usage data, so headroom cannot be measured" }]);
  });

  it("ranks on the TIGHTEST constraint, not the average", () => {
    // 99% of requests left but 2% of tokens left is a provider at 2%.
    const roomy = measured({ id: "mistral", name: "Mistral", remainingRequests: 49, limitRequests: 50, remainingTokens: 30_000, limitTokens: 50_000, model: "mistral-small-latest", latencyMs: 1015 });
    const skewed = measured({ remainingTokens: 160, limitTokens: 8000 });
    const r = recommend([skewed, roomy]);
    expect(r.best?.providerName).toBe("Mistral");
    expect(r.best?.headroomPct).toBe(60);
  });

  it("only ever names a model that was actually supplied", () => {
    const r = recommend([measured({ model: null })]);
    expect(r.best).toBeNull();
    expect(r.excluded[0].why).toMatch(/no model returned/);
  });

  it("reports the measured latency it ranked on, not a claim about speed", () => {
    const r = recommend([measured()]);
    expect(r.best?.reason).toContain("433ms measured round trip");
    expect(r.best?.model).toBe("openai/gpt-oss-20b");
  });
});
