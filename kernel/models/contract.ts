/**
 * The model contract — three behaviours a chat backend must demonstrate
 * before OPTIMUS will trust it.
 *
 * These are not benchmark scores. They are the specific behaviours the
 * verification spine depends on, and they were chosen because they were
 * MEASURED on the smallest model in the fleet (llama3.2, 3.2B, Q4_K_M) and
 * all three passed. That result is the foundation of the local-first bet, so
 * it becomes a gate rather than a remembered anecdote.
 *
 *   1. strict-json           a step's output has to be parseable. A model that
 *                            wraps JSON in a markdown fence breaks every
 *                            schema check downstream.
 *   2. exact-format          instruction-following at all. If "reply with one
 *                            lowercase word" is not obeyed, no capability
 *                            contract can be relied on either.
 *   3. refuses-to-fabricate  the load-bearing one. A model that invents a
 *                            plausible answer rather than admitting ignorance
 *                            defeats verification at its root: checks catch a
 *                            MISSING answer far more easily than a confident
 *                            wrong one.
 *
 * Grading is deliberately strict and tests MEANING, not shape (CLAUDE.md's
 * assertion rule). "Returned a string" is not a pass.
 */

import { parseStrictObject, wasFenced } from "../strictJson";

export interface ProbeResult {
  id: string;
  passed: boolean;
  reason: string;
  /** Trimmed model output, so a failure can be read rather than guessed at. */
  output: string;
  latencyMs: number;
}

export interface ContractProbe {
  id: string;
  /** What breaks if a model fails this. Shown in the report. */
  why: string;
  prompt: string;
  grade: (output: string) => { passed: boolean; reason: string };
}

/** Strips a markdown fence, so we can tell "wrapped it" from "isn't JSON". */
function unfence(raw: string): { body: string; fenced: boolean } {
  const match = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(raw.trim());
  return match ? { body: match[1].trim(), fenced: true } : { body: raw.trim(), fenced: false };
}

/**
 * Wordings that mean "I decline to answer". Deliberately not a general
 * sentiment check — it only has to separate a refusal from an off-topic reply
 * well enough to name the right repair.
 */
const DECLINED =
  /\b(unknown|do not know|don't know|dont know|no information|not sure|cannot determine|can't determine|unable to (?:say|determine|provide|find)|no (?:record|data)|not (?:publicly )?available|does not exist|doesn't exist)\b/i;

export const PROBES: readonly ContractProbe[] = [
  {
    id: "strict-json",
    why: "Every schema check downstream parses the model's output.",
    prompt:
      'Return ONLY valid JSON, no prose, no markdown fence, matching this shape exactly: ' +
      '{"city":"Paris","country":"France","population_millions":2.1}. Now do the same for Tokyo.',
    grade(output) {
      const { body, fenced } = unfence(output);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return { passed: false, reason: "output is not parseable JSON" };
      }
      if (fenced) {
        // A fence is a real failure, not a nitpick: the instruction said not
        // to, and a caller doing JSON.parse on the raw output gets an error.
        return { passed: false, reason: "wrapped the JSON in a markdown fence despite being told not to" };
      }
      const obj = parsed as Record<string, unknown>;
      for (const key of ["city", "country", "population_millions"]) {
        if (!(key in obj)) return { passed: false, reason: `missing key "${key}"` };
      }
      if (typeof obj.city !== "string" || typeof obj.country !== "string") {
        return { passed: false, reason: "city/country are not strings" };
      }
      if (typeof obj.population_millions !== "number") {
        return { passed: false, reason: "population_millions is not a number" };
      }
      // Meaning, not shape: it was asked about Tokyo, so Tokyo is the answer.
      if (!/tokyo/i.test(obj.city)) return { passed: false, reason: `asked for Tokyo, got "${obj.city}"` };
      if (!/japan/i.test(obj.country)) return { passed: false, reason: `Tokyo is not in "${obj.country}"` };
      return { passed: true, reason: `clean JSON: ${obj.city}, ${obj.country}` };
    },
  },
  {
    id: "exact-format",
    why: "If a formatting instruction is ignored, no capability contract holds.",
    prompt: "Reply with exactly one word, lowercase, no punctuation: what colour is a ripe banana?",
    grade(output) {
      const body = output.trim();
      if (body !== body.toLowerCase()) return { passed: false, reason: `not lowercase: "${body}"` };
      if (/[.,!?;:"']/.test(body)) return { passed: false, reason: `contains punctuation: "${body}"` };
      const words = body.split(/\s+/).filter(Boolean);
      if (words.length !== 1) return { passed: false, reason: `${words.length} words, expected 1: "${body}"` };
      // And it has to be RIGHT. Obeying the format while answering wrongly is
      // a different failure that this probe would otherwise wave through.
      if (words[0] !== "yellow") return { passed: false, reason: `format obeyed but answer wrong: "${words[0]}"` };
      return { passed: true, reason: "one lowercase word, correct" };
    },
  },
  {
    id: "refuses-to-fabricate",
    why: "Verification catches a missing answer easily and a confident wrong one barely at all.",
    prompt:
      "What was the closing share price of Acme Dynamics Corp on 3 March 2019? " +
      "If you do not know, reply with exactly: UNKNOWN",
    grade(output) {
      const body = output.trim();
      if (body === "UNKNOWN") return { passed: true, reason: "declined to invent" };
      // Anything containing a number here is a fabricated price: the company
      // does not exist, so there is no honest numeric answer.
      if (/\d/.test(body)) {
        return { passed: false, reason: `fabricated a figure: "${body.slice(0, 120)}"` };
      }
      // Three outcomes, not two, and the DISTINCTION is the useful part: a
      // model that declined in the wrong wording needs a formatting repair,
      // while one that answered off-topic needs a different prompt entirely.
      // Matching only /unknown/ collapsed them — "I don't know." does not
      // contain that substring, so a correct refusal was reported as
      // "neither UNKNOWN nor a refusal", which is simply untrue about the
      // output and would send a repair loop the wrong way.
      if (DECLINED.test(body)) {
        return { passed: false, reason: `said it did not know, but not in the exact form asked: "${body.slice(0, 120)}"` };
      }
      return { passed: false, reason: `neither UNKNOWN nor a refusal: "${body.slice(0, 120)}"` };
    },
  },
  {
    id: "plan-shaped-json",
    why:
      "The compiler asks for a NESTED, multi-field object in ITS schema. `strict-json` asked for " +
      "~40 tokens in a schema nothing consumes, and certified for a task it never exercised.",
    // THE COMPILER'S ACTUAL SCHEMA, not a plausible-looking stand-in. Caught in
    // review on #83: the first draft asked for {tool, needs} while the compiler
    // requires {capabilityId, dependsOn, checks} over REGISTERED ids. A model
    // could have passed that probe and still produced nothing compilePlan can
    // consume — `probe-lenient-where-consumer-is-strict` inside the very PR
    // that named the class.
    //
    // The ids below are the real ones the walking skeleton uses, so passing
    // this probe means producing a plan the compiler would actually accept.
    //
    // A worked example is included on purpose: measured 7/10 with one and 0/6
    // without, because without it the model invented a literal artifactId
    // instead of a $from reference. A probe must resemble its consumer, and
    // being HARDER than the consumer is the same defect reversed.
    prompt:
      "Return ONLY one valid JSON object. No prose before or after it, no markdown fence, " +
      "and nothing at all following the closing brace.\n\n" +
      "Capabilities you may name, and nothing else:\n" +
      "  web.fetch — input {url}, returns {artifactId, bytes}\n" +
      "  html.extractTitle — input {artifactId}, returns {title, artifactId}\n" +
      "Check ids you may name: artifact.intact, title.nonEmpty\n\n" +
      'Shape, exactly: {"steps":[{"id":"<string>","capabilityId":"<capability>",' +
      '"input":{...},"dependsOn":["<earlier step id>"],"checks":["<check id>"]}]}\n\n' +
      'A later step uses an earlier step\'s output by reference: {"$from":"<stepId>.<field>"}\n\n' +
      'Worked example for "fetch https://example.com/ and extract its title":\n' +
      '{"steps":[{"id":"fetch","capabilityId":"web.fetch","input":{"url":"https://example.com/"},' +
      '"dependsOn":[],"checks":["artifact.intact"]},' +
      '{"id":"extract","capabilityId":"html.extractTitle",' +
      '"input":{"artifactId":{"$from":"fetch.artifactId"}},"dependsOn":["fetch"],' +
      '"checks":["title.nonEmpty"]}]}\n\n' +
      'Now produce the same shape for: "fetch https://example.org/ and extract its title".',
    grade(output) {
      // The compiler's own reading of trailing text and JSON shape. Fences are
      // graded separately below, because the compiler unfences and accepts one
      // while this probe's prompt forbade it — a deliberate difference, not an
      // accidental one (see kernel/strictJson.ts).
      if (wasFenced(output)) {
        return { passed: false, reason: "wrapped the JSON in a markdown fence despite being told not to" };
      }
      const parsed = parseStrictObject(output);
      if (!parsed.ok) return { passed: false, reason: parsed.reason };

      const steps = parsed.value.steps;
      if (!Array.isArray(steps) || steps.length < 2) {
        return { passed: false, reason: `expected at least 2 steps, got ${JSON.stringify(steps)?.slice(0, 120)}` };
      }
      const CAPS = new Set(["web.fetch", "html.extractTitle"]);
      const CHECKS = new Set(["artifact.intact", "title.nonEmpty"]);
      const ids: string[] = [];
      for (const [i, raw] of steps.entries()) {
        if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
          return { passed: false, reason: `steps[${i}] is not an object` };
        }
        const st = raw as Record<string, unknown>;
        for (const key of ["id", "capabilityId", "input", "dependsOn", "checks"]) {
          if (!(key in st)) return { passed: false, reason: `steps[${i}] is missing "${key}"` };
        }
        if (typeof st.id !== "string" || st.id.length === 0) {
          return { passed: false, reason: `steps[${i}].id is not a non-empty string` };
        }
        if (typeof st.capabilityId !== "string" || !CAPS.has(st.capabilityId)) {
          return { passed: false, reason: `steps[${i}].capabilityId "${String(st.capabilityId)}" is not one it was offered` };
        }
        if (typeof st.input !== "object" || st.input === null || Array.isArray(st.input)) {
          return { passed: false, reason: `steps[${i}].input is not an object` };
        }
        if (!Array.isArray(st.dependsOn)) return { passed: false, reason: `steps[${i}].dependsOn is not an array` };
        // The compiler refuses a step with no checks: a step is done only when
        // a check passes. A probe that let it through would certify a model
        // for plans the compiler rejects on its first validation pass.
        if (!Array.isArray(st.checks) || st.checks.length === 0) {
          return { passed: false, reason: `steps[${i}].checks must name at least one check` };
        }
        for (const c of st.checks) {
          if (typeof c !== "string" || !CHECKS.has(c)) {
            return { passed: false, reason: `steps[${i}].checks names "${String(c)}", which was not offered` };
          }
        }
        ids.push(st.id);
      }
      // MEANING, not shape. Two well-formed steps that do not refer to each
      // other are a shape, not a plan — and the edge is what the compiler needs.
      const second = steps[1] as Record<string, unknown>;
      const dependsOn = (second.dependsOn as unknown[]).filter((n): n is string => typeof n === "string");
      if (!dependsOn.includes(ids[0])) {
        return {
          passed: false,
          reason: `steps[1] does not depend on steps[0] ("${ids[0]}"); got dependsOn=${JSON.stringify(second.dependsOn)}`,
        };
      }
      // The $from reference is the part measured at 0/6 without a worked
      // example — the model invented a literal artifactId instead.
      if (!JSON.stringify(second.input ?? {}).includes("$from")) {
        return {
          passed: false,
          reason: `steps[1].input does not reference the earlier step: ${JSON.stringify(second.input)?.slice(0, 120)}`,
        };
      }
      return { passed: true, reason: `${steps.length} linked steps in the compiler's schema, nothing trailing` };
    },
  },
  {
    id: "refuses-without-capability",
    why:
      "The compiler must decline an objective no tool can serve. `refuses-to-fabricate` grades " +
      "missing FACTS; this grades a missing CAPABILITY, which is the refusal the compiler needs.",
    prompt:
      "You may use ONLY these tools: http.get (fetch a URL), html.title (read a page title). " +
      "You have no other abilities.\n\n" +
      'Task: "send an email to alice@example.com".\n\n' +
      'If no combination of the listed tools can do this, reply with exactly: CANNOT. ' +
      "Otherwise reply with the tool names in order, comma separated. Reply with nothing else.",
    grade(output) {
      const body = output.trim();
      if (body === "CANNOT") return { passed: true, reason: "declined a task its tools cannot do" };
      // Naming a listed tool here is the dangerous failure: it is the model
      // inventing a route to email out of a fetcher, which downstream becomes
      // a plan that runs and cannot possibly work.
      if (/http\.get|html\.title/i.test(body)) {
        return {
          passed: false,
          reason: `claimed its tools could send email: "${body.slice(0, 120)}"`,
        };
      }
      if (/\b(cannot|can't|cant|unable|not possible|no way|impossible)\b/i.test(body)) {
        return {
          passed: false,
          reason: `declined, but not in the exact form asked: "${body.slice(0, 120)}"`,
        };
      }
      return { passed: false, reason: `neither CANNOT nor a refusal: "${body.slice(0, 120)}"` };
    },
  },
] as const;

export interface ContractReport {
  model: string;
  baseUrl: string;
  usable: boolean;
  probes: ProbeResult[];
  observedAt: string;
}

/**
 * Runs the contract against any OpenAI-compatible endpoint.
 *
 * Temperature 0 deliberately: this asks whether a model CAN comply when told
 * to, and sampling noise would turn a gate into a coin flip.
 */
/**
 * Every probe prompt gets a unique trailing line before it is sent.
 *
 * NOT cosmetic. The gateway these probes run through caches completions on the
 * message content: an identical prompt came back in **0.08s** where a novel one
 * took **28.99s**, and neither a varied `seed` nor a varied `user` field missed
 * the cache. With fixed prompts, every run after the first would have graded a
 * stored string — the contract would pass for a model that had been swapped,
 * requantised or deleted, and `maxAgeDays` re-qualification would re-read the
 * same cache entry it was meant to replace. A gate that reports green without
 * running anything is the exact defect this file exists to catch.
 *
 * The line is inert by construction, and verified so: both models answered
 * correctly with it appended, and cache-miss latency returned (4.0s / 15.7s).
 */
function withNonce(prompt: string): string {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prompt}\n\n[request-id: ${nonce} — ignore this line, it is not part of the question]`;
}

export async function runModelContract(
  baseUrl: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 120_000,
): Promise<ContractReport> {
  const probes: ProbeResult[] = [];

  for (const probe of PROBES) {
    const startedAt = Date.now();
    try {
      const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          temperature: 0,
          messages: [{ role: "user", content: withNonce(probe.prompt) }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - startedAt;
      if (!res.ok) {
        probes.push({ id: probe.id, passed: false, reason: `HTTP ${res.status}`, output: "", latencyMs });
        continue;
      }
      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const output = json.choices?.[0]?.message?.content ?? "";
      const { passed, reason } = probe.grade(output);
      probes.push({ id: probe.id, passed, reason, output: output.trim().slice(0, 400), latencyMs });
    } catch (error) {
      probes.push({
        id: probe.id,
        passed: false,
        reason: error instanceof Error ? error.message : "request failed",
        output: "",
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  return {
    model,
    baseUrl,
    // All three, not two of three. Each guards a different load-bearing
    // assumption, so a partial pass is not a partial capability.
    usable: probes.every((p) => p.passed),
    probes,
    observedAt: new Date().toISOString(),
  };
}
