/**
 * K1 — the one capability registry.
 *
 * Before this, three places built their own broker and disagreed:
 *
 *   app/api/missions/route.ts   registered llm.chat, and nothing else
 *   kernel/cli.ts               registered web.fetch + html.extractTitle
 *   (nowhere)                   scrapling.relocate, browser.navigate
 *
 * Two capabilities were absorbed, scored, validated across 20 live scenarios —
 * and unreachable from the running product. They passed their tests and did
 * not exist in the app. That gap does not announce itself: every gate was
 * green the whole time, because no gate asked the question.
 *
 * It is the same shape as the CI gate list before #33 — one fact, three
 * copies, already diverged — so it gets the same fix: one module, every
 * consumer reads it, and a test asserts they agree.
 *
 * REGISTERED IS NOT AVAILABLE. Registering a capability makes the kernel able
 * to invoke it; it does not make it AVAILABLE in the sense of Directive #4,
 * and nothing in the UI may present it as working. Today no mission plan
 * names these — `route.ts` builds a fixed one-step spec — so they are wired
 * and unreached. That is the honest state, and it is strictly better than
 * wired-nowhere: when the planner lands, the capabilities it can choose from
 * are the ones in this file.
 */

import { Broker } from "./broker";
import type { Capability, Check } from "./types";
import type { Repair } from "./harness";
import { webFetch, htmlExtractTitle, titleNonEmpty, artifactExists } from "./builtin";
import {
  scraplingRelocate,
  relocateContractHonored,
  relocateFoundMatch,
  relocateRepair,
} from "./capabilities/scrapling-relocate";
import { llmChat, llmChatSucceeded } from "./capabilities/omniroute/chat";
import { browserNavigate, browserNavigateSucceeded } from "./capabilities/browser-use/navigate";

/**
 * Every capability the kernel knows how to run.
 *
 * Adding an absorbed capability here is part of absorbing it — gate 9 says the
 * broker adapter must be "registered and callable from the kernel, not just
 * present in code", and a capability in `kernel/capabilities/` that never
 * reaches a broker is present-in-code exactly.
 */
export const ALL_CAPABILITIES: readonly Capability[] = [
  webFetch,
  htmlExtractTitle,
  scraplingRelocate,
  llmChat,
  browserNavigate,
];

/** Every check. A capability's check must be registered or its steps cannot pass. */
export const ALL_CHECKS: readonly Check[] = [
  titleNonEmpty,
  artifactExists,
  relocateContractHonored,
  relocateFoundMatch,
  llmChatSucceeded,
  browserNavigateSucceeded,
];

/**
 * Repairs keyed by CAPABILITY id. The scheduler falls back to these when no
 * step- or agent-specific repair is registered, so a capability's recovery
 * knowledge travels with it instead of being re-supplied at every call site.
 *
 * A capability with no entry simply has no repair: its steps fail on the first
 * failed check rather than retrying. That is the honest default — a repair
 * that does not understand its capability would just burn budget on identical
 * attempts.
 */
export const ALL_REPAIRS: Readonly<Record<string, Repair>> = {
  "scrapling.relocate": relocateRepair,
};

export interface BuildBrokerOptions {
  /**
   * Swap a capability for another with the same id. The CLI's `fail` demo
   * needs a sabotaged html.extractTitle to show verification blocking a lie.
   *
   * An override REPLACES rather than adds: the broker refuses a duplicate id,
   * and silently registering both would leave which one wins up to insertion
   * order.
   */
  overrides?: readonly Capability[];
}

export function buildBroker(options: BuildBrokerOptions = {}): Broker {
  const broker = new Broker();
  const overrides = new Map(options.overrides?.map((c) => [c.manifest.id, c]));

  for (const capability of ALL_CAPABILITIES) {
    broker.register(overrides.get(capability.manifest.id) ?? capability);
  }
  // An override for an id that is not in ALL_CAPABILITIES is a typo, and a
  // typo here silently means "the real capability is still registered and my
  // replacement did nothing" — which is precisely the class of quiet failure
  // this module exists to end.
  for (const id of overrides.keys()) {
    if (!ALL_CAPABILITIES.some((c) => c.manifest.id === id)) {
      throw new Error(`buildBroker: override for unknown capability "${id}" — nothing was replaced`);
    }
  }
  for (const check of ALL_CHECKS) broker.registerCheck(check);
  return broker;
}
