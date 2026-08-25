import type { LlmChatOutput } from "../../kernel/capabilities/omniroute/chat";
import type { Scenario, ScenarioResult } from "./types";

/**
 * llm.chat's real claim: a reply from a real model through a real OmniRoute
 * router, with honest evidence. Scenarios cover the happy path, the checkable
 * path (arithmetic a person can verify), and — the part that matters most —
 * the failure paths, where the answer must be an honest error rather than a
 * confident-looking fabrication.
 */

const BASE = process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128";
const MODEL = process.env.OMNIROUTE_DEFAULT_MODEL ?? "ollama/llama3.2:latest";
const CHECKS = ["llm.chatSucceeded"];

function o(r: ScenarioResult): Partial<LlmChatOutput> {
  return (r.output ?? {}) as Partial<LlmChatOutput>;
}

function ask(content: string, extra: Record<string, unknown> = {}) {
  return { baseUrl: BASE, model: MODEL, messages: [{ role: "user", content }], ...extra };
}

/** A real reply arrived and the check passed. */
function replied(r: ScenarioResult): { ok: boolean; observed: string } {
  const out = o(r);
  return {
    ok: r.status === "passed" && typeof out.content === "string" && out.content.trim().length > 0,
    observed:
      r.status === "passed"
        ? `"${(out.content ?? "").trim().slice(0, 60)}" · ${out.usage?.totalTokens ?? "?"} tokens`
        : `status ${r.status} — ${r.evidence?.checks?.[0]?.reason ?? r.threw ?? "no reason"}`,
  };
}

/** The step must NOT pass, and must carry a real reason. */
function failsHonestly(r: ScenarioResult): { ok: boolean; observed: string } {
  const reason = r.evidence?.checks?.find((c) => !c.passed)?.reason ?? r.threw ?? "";
  const fabricated = typeof o(r).content === "string" && o(r).content!.trim().length > 0;
  return {
    ok: r.status !== "passed" && reason.length > 0 && !fabricated,
    observed:
      r.status !== "passed"
        ? `refused honestly: ${reason.slice(0, 80)}`
        : `WRONG — passed and returned content it should not have`,
  };
}

export const llmChatScenarios: Scenario[] = [
  {
    id: "simple-reply",
    intent: "Answers a plain question with real text from the local model",
    input: ask("Reply with exactly the word: ONLINE"),
    checks: CHECKS,
    verdict: replied,
  },
  {
    id: "checkable-arithmetic",
    intent: "17 × 24 — an answer a person can verify is 408",
    input: ask("What is 17 multiplied by 24? Reply with only the number."),
    checks: CHECKS,
    verdict(r) {
      const text = (o(r).content ?? "").replace(/[, ]/g, "");
      const correct = text.includes("408");
      return {
        ok: r.status === "passed" && correct,
        observed: correct
          ? `correct: "${(o(r).content ?? "").trim().slice(0, 40)}"`
          : `model answered "${(o(r).content ?? "").trim().slice(0, 40)}" — expected 408`,
      };
    },
  },
  {
    id: "multi-turn-context",
    intent: "Carries context across turns — recalls a name given earlier",
    input: {
      baseUrl: BASE,
      model: MODEL,
      messages: [
        { role: "user", content: "My project is called Optimus. Remember that." },
        { role: "assistant", content: "Got it — your project is called Optimus." },
        { role: "user", content: "What is my project called? Reply with just the name." },
      ],
    },
    checks: CHECKS,
    verdict(r) {
      const recalled = /optimus/i.test(o(r).content ?? "");
      return {
        ok: r.status === "passed" && recalled,
        observed: recalled
          ? `recalled: "${(o(r).content ?? "").trim().slice(0, 40)}"`
          : `lost context: "${(o(r).content ?? "").trim().slice(0, 40)}"`,
      };
    },
  },
  {
    id: "system-prompt-obeyed",
    intent: "Honours a system instruction rather than ignoring it",
    input: {
      baseUrl: BASE,
      model: MODEL,
      messages: [
        { role: "system", content: "You always answer in exactly one word." },
        { role: "user", content: "What colour is a clear midday sky?" },
      ],
    },
    checks: CHECKS,
    verdict(r) {
      const text = (o(r).content ?? "").trim();
      const words = text.split(/\s+/).filter(Boolean).length;
      return {
        ok: r.status === "passed" && words <= 3,
        observed: `${words} word(s): "${text.slice(0, 50)}"`,
      };
    },
  },
  {
    id: "evidence-has-real-usage",
    intent: "Evidence carries real token counts, not placeholders",
    input: ask("Say hello."),
    checks: CHECKS,
    verdict(r) {
      const u = o(r).usage;
      const real = !!u && (u.totalTokens ?? 0) > 0 && (u.promptTokens ?? 0) > 0;
      return {
        ok: r.status === "passed" && real,
        observed: real
          ? `prompt ${u!.promptTokens} + completion ${u!.completionTokens} = ${u!.totalTokens}`
          : `no real usage recorded: ${JSON.stringify(u)}`,
      };
    },
  },
  {
    id: "artifact-persisted",
    intent: "The raw upstream response is stored as a retrievable artifact",
    input: ask("Reply with one short sentence."),
    checks: CHECKS,
    verdict(r) {
      const id = o(r).artifactId;
      const inEvidence = r.evidence?.artifactIds?.includes(id ?? "");
      return {
        ok: r.status === "passed" && !!id && !!inEvidence,
        observed: id
          ? `artifact ${id.slice(0, 24)}… ${inEvidence ? "referenced in evidence" : "MISSING from evidence"}`
          : "no artifact id returned",
      };
    },
  },
  {
    id: "remote-host-refused-at-the-contract",
    // Was "sandbox-blocks-remote-host", asserting K4's message. Input
    // constraints landed and the refusal moved one layer EARLIER — the value
    // is now refused at the manifest, before the capability is handed it, so
    // no request is ever assembled around a remote host.
    //
    // The expectation is updated rather than loosened. Accepting "it failed
    // somehow" here is the exact masking bug this suite already had once: a
    // scenario that passes on any failure stops being evidence.
    //
    // K4 is NOT untested by this change — it is unreachable-by-construction
    // for this input, because the contract's host list and
    // isolation.allowedHosts are deliberately the same list. K4's own layer
    // is proven independently in tests/kernel/input-contract.test.ts, which
    // registers a variant with the constraint loosened and shows the sandbox
    // still stops it.
    intent: "A non-loopback baseUrl is refused before the capability sees it — the model layer is local-only by design",
    input: ask("hello", { baseUrl: "https://api.openai.com" }),
    checks: CHECKS,
    verdict(r) {
      const reason = r.evidence?.checks?.find((c) => !c.passed)?.reason ?? "";
      // Names the layer AND the offending value: a refusal that mentions
      // neither could be any failure at all.
      const blocked = /input refused/i.test(reason) && /baseUrl/.test(reason);
      return {
        ok: r.status !== "passed" && blocked,
        observed: blocked
          ? `refused at the manifest, before run(): ${reason.slice(0, 80)}`
          : `NOT blocked — status ${r.status}, reason ${reason.slice(0, 80)}`,
      };
    },
  },
  {
    id: "unknown-model-fails-honestly",
    intent: "A model that does not exist produces an error, never a fabricated reply",
    input: { baseUrl: BASE, model: "ollama/this-model-does-not-exist", messages: [{ role: "user", content: "hi" }] },
    checks: CHECKS,
    verdict: failsHonestly,
  },
  {
    id: "unreachable-port-fails-honestly",
    intent: "A dead model layer is reported as unavailable, not answered around",
    input: ask("hi", { baseUrl: "http://127.0.0.1:9", timeoutMs: 3000 }),
    checks: CHECKS,
    verdict: failsHonestly,
  },
  {
    id: "empty-message-rejected",
    intent: "Refuses an empty prompt at the contract, before spending a model call",
    input: { baseUrl: BASE, model: MODEL, messages: [] },
    checks: CHECKS,
    verdict: failsHonestly,
  },
];
