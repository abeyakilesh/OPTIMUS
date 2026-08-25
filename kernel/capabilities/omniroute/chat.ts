/**
 * Gates 8-10 for absorb/omniroute: the capability contract and broker
 * adapter over OmniRoute's real `/v1/chat/completions` endpoint (SERVICE
 * fate — the real router, failover, and 500+-model catalog run as their own
 * local process; this file never reimplements any of that, it calls it over
 * HTTP through netFetch).
 *
 * Requires an OmniRoute server already running locally, with at least one
 * provider connection configured (see this directory's README for exactly
 * how — it's a two-call HTTP setup, no UI needed). This capability does NOT
 * spawn OmniRoute itself: booting is a full Next.js server (seconds, with
 * SQLite migrations on first run), the wrong shape for a per-call primitive.
 * `browser.navigate`'s one-shot bridge-process pattern doesn't fit here for
 * exactly that reason — this is `netFetch` against an already-running
 * service, not `spawnProcess` running something to completion.
 */

import type { Capability, Check, CheckResult } from "../../types";

const DEFAULT_BASE_URL = "http://127.0.0.1:20128";

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmChatInput {
  /** Defaults to a local OmniRoute instance on its standard dev port. */
  baseUrl?: string;
  /** Only needed if the OmniRoute instance has REQUIRE_API_KEY enabled. */
  apiKey?: string;
  /** OmniRoute's routing id, e.g. "ollama/llama3.2:latest" — not a raw model name. */
  model: string;
  messages: LlmChatMessage[];
  /** Overrides the step's wall-time budget for a known-slow cold model load. */
  timeoutMs?: number;
}

export interface LlmChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmChatOutput {
  ok: boolean;
  status: number;
  model?: string;
  content?: string;
  usage?: LlmChatUsage;
  error?: string;
  artifactId: string;
}

const DEFAULT_TIMEOUT_MS = 60_000; // real model cold-starts (Ollama loading a model) can take tens of seconds

function extractErrorMessage(parsed: Record<string, unknown>, status: number): string {
  const err = parsed.error;
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  if (typeof err === "string") return err;
  return `unexpected response shape (status ${status})`;
}

/**
 * Real chat completion via OmniRoute's own routing/failover — not a direct
 * call to a single provider. Verified end-to-end against a live local
 * OmniRoute instance routing to Ollama (llama3.2:3b): real 200, real
 * `choices[0].message.content`, real token usage, zero API key, zero
 * internet. See the README for the exact reproduction steps.
 *
 * Permission honesty: `net:write` is REAL and enforced by netFetch — no
 * declarative-only gap here, unlike browser.navigate's proc:spawn situation.
 * netFetch makes the HTTP call directly in this process; there is no
 * unsandboxed child process in between.
 */
export const llmChat: Capability = {
  manifest: {
    id: "llm.chat",
    version: "3.8.50-service", // pinned OmniRoute version, see requirements.txt
    permissions: ["net:write"],
    isolation: {
      // CLAUDE.md: OmniRoute is BUNDLED — "a local child process (stdio/
      // localhost, no internet). It is NOT an external API." So the radius
      // is loopback, full stop. A caller passing a remote baseUrl is denied
      // by the boundary, which is the intended behaviour, not a limitation.
      allowedHosts: ["127.0.0.1", "localhost", "[::1]"],
    },
    inputConstraints: {
      // THE reason this layer exists. isolation.allowedHosts above stops the
      // socket opening to a remote host — it does NOT stop this capability
      // being handed `baseUrl: "https://api.openai.com"` and assembling a
      // request around it first, Authorization header and all, before K4
      // refuses the connection. The credential is put into a request that is
      // then thrown away; that is a leak with good luck, not a boundary.
      //
      // The host list is deliberately the same one as isolation.allowedHosts.
      // Two layers, one policy, both enforced — a reader can check they agree.
      baseUrl: { kind: "url", allowedSchemes: ["http"], allowedHosts: ["127.0.0.1", "localhost", "[::1]"] },
      // Bounded, not enumerated: the value is a secret we cannot list. The
      // length cap is what stops an oversized blob being smuggled through a
      // header field.
      apiKey: { kind: "string", maxLength: 512 },
      model: { kind: "string", required: true, minLength: 1, maxLength: 200 },
      messages: {
        kind: "array",
        required: true,
        minLength: 1,
        maxLength: 500,
        of: {
          kind: "object",
          fields: {
            role: { kind: "string", required: true, enum: ["system", "user", "assistant"] },
            content: { kind: "string", required: true, maxLength: 500_000 },
          },
        },
      },
      timeoutMs: { kind: "number", integer: true, min: 1, max: 600_000 },
    },
    defaultBudget: { maxAttempts: 2, maxWallTimeMs: DEFAULT_TIMEOUT_MS, maxCost: 20 },
    description:
      "Sends a chat completion through a local OmniRoute instance's real " +
      "router/failover engine and returns the model's reply.",
  },
  async run(input, ctx) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      apiKey,
      model,
      messages,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    } = input as LlmChatInput;

    if (!model || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("llm.chat requires { model: string, messages: LlmChatMessage[] }");
    }

    const response = await ctx.netFetch({
      url: `${baseUrl}/v1/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages, stream: false }),
      timeoutMs,
    });

    if (response.timedOut) {
      const artifactId = await ctx.putArtifact(JSON.stringify({ ok: false, error: "timed out" }));
      return { ok: false, status: 0, error: `request exceeded ${timeoutMs}ms`, artifactId } satisfies LlmChatOutput;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      throw new Error(`llm.chat: non-JSON response (status ${response.status}): ${response.body.slice(-500)}`);
    }

    const artifactId = await ctx.putArtifact(JSON.stringify(parsed));

    const choice = (parsed.choices as Array<{ message?: { content?: string } }> | undefined)?.[0];
    const content = choice?.message?.content;
    const ok = response.status >= 200 && response.status < 300 && typeof content === "string";
    const usageRaw = parsed.usage as
      | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      | undefined;

    if (!ok) {
      return {
        ok: false,
        status: response.status,
        error: extractErrorMessage(parsed, response.status),
        artifactId,
      } satisfies LlmChatOutput;
    }

    return {
      ok: true,
      status: response.status,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      content,
      usage: usageRaw
        ? {
            promptTokens: usageRaw.prompt_tokens,
            completionTokens: usageRaw.completion_tokens,
            totalTokens: usageRaw.total_tokens,
          }
        : undefined,
      artifactId,
    } satisfies LlmChatOutput;
  },
};

/**
 * A real check, not a rubber stamp: OmniRoute can return 200 with an empty
 * choice, or a well-formed error body, just as easily as a genuine reply —
 * this verifies actual assistant content came back.
 */
export const llmChatSucceeded: Check = {
  id: "llm.chatSucceeded",
  async run(output): Promise<CheckResult> {
    const result = output as Partial<LlmChatOutput> | undefined;

    if (!result || result.ok !== true) {
      return {
        checkId: "llm.chatSucceeded",
        passed: false,
        reason: `chat completion did not succeed: ${result?.error ?? "unknown error"}`,
      };
    }
    if (!result.content || result.content.trim().length === 0) {
      return {
        checkId: "llm.chatSucceeded",
        passed: false,
        reason: "chat completion reported ok=true but returned no content",
      };
    }

    return {
      checkId: "llm.chatSucceeded",
      passed: true,
      reason: `model "${result.model}" replied with ${result.content.length} chars` +
        (result.usage?.totalTokens ? `, ${result.usage.totalTokens} tokens` : ""),
      detail: { model: result.model, contentLength: result.content.length, usage: result.usage },
    };
  },
};
