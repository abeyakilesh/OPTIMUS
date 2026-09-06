import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { ALL_CAPABILITIES, ALL_CHECKS, buildBroker } from "../../kernel/registry";
import type { Capability, CapabilityManifest } from "../../kernel/types";

/**
 * One registry, every consumer reads it, and these tests assert they agree.
 *
 * The gap this closes was invisible: scrapling.relocate and browser.navigate
 * were absorbed, scored, and validated across 20 live scenarios while being
 * unreachable from the running product. Every gate stayed green, because no
 * gate asked whether an absorbed capability had ever reached a broker.
 */

const ROOT = join(process.cwd());
const CAPABILITY_DIR = join(ROOT, "kernel", "capabilities");

/**
 * The keys of `T` that are NOT optional. `Pick<T, K>` for an optional key is
 * `{ K?: … }`, which `object` is assignable to; for a required key it is not.
 */
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

/**
 * One presence test per REQUIRED field of `CapabilityManifest` — and the type
 * annotation is the mechanism, not the decoration.
 *
 * `looksLikeCapability` below asserts `value is Capability`, which promises
 * every field of that interface. It used to check `manifest?.id` and nothing
 * else: six manifest fields asserted, one examined. That is
 * `predicate-asserts-more-than-it-checks`, and `tsc` cannot catch it, because
 * a type predicate's BODY is never verified against the type it asserts —
 * only that the asserted type is assignable to the parameter's.
 *
 * `Record<RequiredKeys<CapabilityManifest>, …>` closes that specific gap by
 * hand: adding a required field to the manifest interface makes this object
 * literal fail to compile until the field is listed. #66 is the proof it
 * works — `outputs` was added to the interface, and this line is why it could
 * not be added to the interface alone.
 *
 * What it does NOT do, stated so the row in DEFECT_CLASSES.md stays honest:
 * it forces a check to EXIST per required field. It cannot force that check to
 * be a good one. `() => true` would compile.
 */
const MANIFEST_FIELD_PRESENT: Record<
  RequiredKeys<CapabilityManifest>,
  (m: CapabilityManifest) => boolean
> = {
  id: (m) => typeof m.id === "string" && m.id.length > 0,
  version: (m) => typeof m.version === "string" && m.version.length > 0,
  permissions: (m) => Array.isArray(m.permissions),
  inputConstraints: (m) => isRecord(m.inputConstraints),
  outputs: (m) => isRecord(m.outputs),
  defaultBudget: (m) => isRecord(m.defaultBudget),
  description: (m) => typeof m.description === "string",
};

const REQUIRED_MANIFEST_FIELDS = Object.keys(MANIFEST_FIELD_PRESENT) as Array<
  RequiredKeys<CapabilityManifest>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeCapability(value: unknown): value is Capability {
  if (!isRecord(value)) return false;
  if (typeof value.run !== "function") return false;
  if (!isRecord(value.manifest)) return false;
  const manifest = value.manifest as unknown as CapabilityManifest;
  return REQUIRED_MANIFEST_FIELDS.every((field) => MANIFEST_FIELD_PRESENT[field](manifest));
}

async function capabilityFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await capabilityFiles(path)));
    else if (entry.name.endsWith(".ts")) found.push(path);
  }
  return found;
}

describe("the registry is the single source", () => {
  it("registers every capability it lists, and they are callable", () => {
    const broker = buildBroker();
    for (const capability of ALL_CAPABILITIES) {
      expect(broker.has(capability.manifest.id), capability.manifest.id).toBe(true);
      expect(broker.capability(capability.manifest.id).manifest.id).toBe(capability.manifest.id);
    }
    expect(broker.manifests()).toHaveLength(ALL_CAPABILITIES.length);
  });

  it("registers every check it lists", () => {
    const broker = buildBroker();
    for (const check of ALL_CHECKS) expect(broker.check(check.id).id).toBe(check.id);
  });

  /**
   * The mechanism, not a note: absorbing a capability and forgetting to
   * register it now fails a test instead of passing silently for weeks.
   */
  it("lists EVERY capability exported under kernel/capabilities", async () => {
    const registered = new Set(ALL_CAPABILITIES.map((c) => c.manifest.id));
    const missing: string[] = [];

    for (const file of await capabilityFiles(CAPABILITY_DIR)) {
      const mod = (await import(file)) as Record<string, unknown>;
      for (const [name, value] of Object.entries(mod)) {
        if (!looksLikeCapability(value)) continue;
        if (!registered.has(value.manifest.id)) {
          missing.push(`${relative(ROOT, file)} exports ${name} (${value.manifest.id})`);
        }
      }
    }

    expect(
      missing,
      "absorbed but never registered — gate 9 requires a broker adapter that is callable, " +
        "not merely present in code:\n  " + missing.join("\n  "),
    ).toEqual([]);
  });

  it("gives every registered capability's checks a home", () => {
    // A capability whose check is unregistered can never pass a step: the
    // harness throws looking it up, and the failure reads like a bug in the
    // capability rather than a missing line in this file.
    const checkIds = new Set(ALL_CHECKS.map((c) => c.id));
    expect(checkIds.has("llm.chatSucceeded")).toBe(true);
    expect(checkIds.has("browser.navigateSucceeded")).toBe(true);
    expect(checkIds.has("relocate.contractHonored")).toBe(true);
  });

  it("does not leave a duplicate id to insertion order", () => {
    const ids = ALL_CAPABILITIES.map((c) => c.manifest.id);
    expect(new Set(ids).size, `duplicate capability id in ALL_CAPABILITIES: ${ids}`).toBe(ids.length);
    const checkIds = ALL_CHECKS.map((c) => c.id);
    expect(new Set(checkIds).size).toBe(checkIds.length);
  });
});

/**
 * THE MUTATION RULE, applied to the predicate itself: remove its subject and
 * watch it go red. The subject here is "every required field of the manifest",
 * so the mutation is done once PER FIELD, driven off the same list the
 * predicate uses — a hand-written list here could go stale against the
 * predicate and the test would keep passing while checking less.
 */
describe("looksLikeCapability checks every field it asserts", () => {
  const real = ALL_CAPABILITIES[0];

  it("accepts a genuine capability", () => {
    expect(looksLikeCapability(real)).toBe(true);
  });

  it.each(REQUIRED_MANIFEST_FIELDS)("rejects a manifest missing %s", (field) => {
    const manifest = { ...real.manifest } as Record<string, unknown>;
    delete manifest[field];
    expect(looksLikeCapability({ manifest, run: real.run })).toBe(false);
  });

  it("rejects the shapes that are not capabilities at all", () => {
    // The registry sweep imports whole modules and looks at every export, so
    // these are the values it actually meets: constants, types-at-runtime,
    // helper functions, checks.
    for (const notACapability of [undefined, null, "web.fetch", 42, [], {}, () => {}, { manifest: {} }]) {
      expect(looksLikeCapability(notACapability), JSON.stringify(notACapability ?? null)).toBe(false);
    }
  });
});

describe("overrides replace, and a typo is refused", () => {
  const fake: Capability = {
    manifest: { ...ALL_CAPABILITIES[1].manifest },
    async run() {
      return { title: "" };
    },
  };

  it("swaps a capability rather than registering a second one", () => {
    const broker = buildBroker({ overrides: [fake] });
    expect(broker.manifests()).toHaveLength(ALL_CAPABILITIES.length);
    expect(broker.capability(fake.manifest.id)).toBe(fake);
  });

  it("throws on an override for an id that is not registered", () => {
    // Otherwise the real capability stays registered and the caller believes
    // it was replaced — the CLI's sabotage demo would silently prove nothing.
    const typo: Capability = {
      manifest: { ...fake.manifest, id: "html.extractTilte" },
      async run() {
        return {};
      },
    };
    expect(() => buildBroker({ overrides: [typo] })).toThrow(/nothing was replaced/);
  });
});

describe("no consumer builds its own broker", () => {
  /**
   * The divergence itself, prevented. route.ts and cli.ts each used to call
   * `new Broker()` and register a different set; that is how two absorbed
   * capabilities ended up in neither.
   */
  it("route.ts and cli.ts go through buildBroker", async () => {
    for (const file of ["app/api/missions/route.ts", "kernel/cli.ts"]) {
      const source = await readFile(join(ROOT, file), "utf8");
      expect(source, `${file} must not construct its own Broker`).not.toMatch(/new Broker\s*\(/);
      expect(source, `${file} must use the shared registry`).toContain("buildBroker");
    }
  });

  it("only the registry and tests construct a Broker directly", async () => {
    const offenders: string[] = [];
    for (const dir of ["app", "kernel", "lib", "components"]) {
      for (const file of await capabilityFiles(join(ROOT, dir)).catch(() => [])) {
        if (file.endsWith("registry.ts") || file.endsWith("broker.ts")) continue;
        // Mutation tests compile a modified copy of a kernel module as a
        // SIBLING of the original, because its relative imports have to keep
        // resolving. Those copies exist for milliseconds and vitest runs test
        // files in parallel, so this scan can meet one — and can equally meet
        // its absence between the readdir and the read. Neither is an
        // offender, and a flake here would read as a real violation.
        if (/\.mutant-/.test(file)) continue;
        const source = await readFile(file, "utf8").catch(() => "");
        if (/new Broker\s*\(/.test(source)) offenders.push(relative(ROOT, file));
      }
    }
    expect(offenders, `these build a private broker instead of using buildBroker():\n  ${offenders.join("\n  ")}`).toEqual([]);
  });
});
