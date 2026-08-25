/**
 * The model qualification record — which models have actually passed the
 * contract in `./contract.ts`, and when.
 *
 * WHY A RECORD AND NOT A LIVE CHECK. Running the three probes takes 12-40s
 * against a local model. Doing that at every boot would make the qualification
 * either a startup stall or, far worse, something someone disables the first
 * time it is inconvenient. So the probes run deliberately, their result is
 * committed to `qualified.json`, and everything downstream reads the record.
 *
 * That buys the property #34 wants for fidelity goldens and the bible wants
 * for skills: **re-qualifying is a reviewable act.** Adding a model shows up
 * as a diff someone can refuse, not a runtime decision nobody sees.
 *
 * It costs the obvious thing, so it is stated rather than discovered: a record
 * is a claim about a probe run that happened in the past, and the model behind
 * it can be swapped, requantised or upgraded without the id changing. That is
 * what `maxAgeDays` is for — a qualification expires, exactly like a skill is
 * re-verified before reuse. An expired record is treated as NOT qualified, not
 * as a warning.
 */
import record from "./qualified.json";

export interface QualifiedProbe {
  id: string;
  passed: boolean;
  reason: string;
}

export interface QualifiedModel {
  /** Routing id as the caller will actually name it, e.g. "ollama/qwen2.5:7b". */
  id: string;
  /** The endpoint it was proven against — a model is not qualified in the abstract. */
  baseUrl: string;
  qualifiedAt: string;
  probes: QualifiedProbe[];
}

export interface QualificationRecord {
  contractVersion: number;
  maxAgeDays: number;
  models: QualifiedModel[];
}

export const QUALIFICATION: QualificationRecord = record as QualificationRecord;

/** The current contract's version. Bumped when a probe is added or changed. */
export const CONTRACT_VERSION = 1;

export type QualificationVerdict =
  | { qualified: true; entry: QualifiedModel; ageDays: number }
  | { qualified: false; reason: string };

/**
 * Deliberately takes `now` rather than reading the clock, so the expiry path
 * is testable without waiting 30 days or stubbing Date.
 */
export function qualificationOf(
  model: string,
  now: Date = new Date(),
  rec: QualificationRecord = QUALIFICATION,
): QualificationVerdict {
  if (rec.contractVersion !== CONTRACT_VERSION) {
    return {
      qualified: false,
      reason:
        `the qualification record was written against contract v${rec.contractVersion}, ` +
        `but this build runs v${CONTRACT_VERSION} — every model must be re-qualified`,
    };
  }

  const entry = rec.models.find((m) => m.id === model);
  if (!entry) {
    const known = rec.models.map((m) => m.id);
    return {
      qualified: false,
      reason:
        `"${model}" has not passed the model contract. ` +
        (known.length
          ? `Qualified: ${known.join(", ")}.`
          : "No model has been qualified yet.") +
        ` Run: npx tsx scripts/model-contract.ts ${model} <baseUrl> --record`,
    };
  }

  // A record that says a probe failed is not a qualification. Guards against
  // a --record run being written for a model that did not actually pass.
  const failed = entry.probes.filter((p) => !p.passed);
  if (failed.length > 0) {
    return {
      qualified: false,
      reason: `"${model}" is in the record but failed ${failed.map((p) => p.id).join(", ")}`,
    };
  }

  const ageMs = now.getTime() - new Date(entry.qualifiedAt).getTime();
  if (Number.isNaN(ageMs)) {
    return { qualified: false, reason: `"${model}" has an unreadable qualifiedAt: ${entry.qualifiedAt}` };
  }
  const ageDays = ageMs / 86_400_000;
  if (ageDays > rec.maxAgeDays) {
    return {
      qualified: false,
      reason:
        `"${model}" was qualified ${Math.floor(ageDays)} days ago, past the ` +
        `${rec.maxAgeDays}-day limit. A model id is not a model — re-run the contract.`,
    };
  }

  return { qualified: true, entry, ageDays };
}

export function isQualified(model: string, now?: Date): boolean {
  return qualificationOf(model, now).qualified;
}

export function qualifiedModelIds(rec: QualificationRecord = QUALIFICATION): string[] {
  return rec.models.map((m) => m.id);
}
