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
          messages: [{ role: "user", content: probe.prompt }],
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
