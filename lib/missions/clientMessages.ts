/**
 * The trust boundary for chat input (#64).
 *
 * Extracted from the route handler so it can be tested directly. It is a pure
 * function over an untrusted request body, and it is the single place where
 * bytes that arrived over HTTP become something the kernel is willing to
 * describe as coming from the operator.
 */
import type { LlmChatMessage } from "@/kernel/capabilities/omniroute/chat";

/** What a client may send. Note the absence of `trust`. */
export interface ClientMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const ROLES = new Set(["system", "user", "assistant"]);

/**
 * REFUSES a body that tries to declare its own provenance.
 *
 * This is the load-bearing rule of the whole change. If a client could send
 * `trust: "kernel"`, anyone able to POST could have their content presented to
 * the model as an OPTIMUS-authored instruction — which would turn a tagging
 * system into an escalation path pointed the wrong way, and would be strictly
 * worse than having no tags at all, because the tag would then carry
 * authority it had not earned.
 *
 * Refused, not stripped: silently dropping the field lets a caller believe it
 * was honoured, and a caller who believes that will build on it.
 */
export function isValidMessages(value: unknown): value is ClientMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        !!m &&
        typeof m === "object" &&
        !("trust" in (m as object)) &&
        !("source" in (m as object)) &&
        ROLES.has((m as { role?: unknown }).role as string) &&
        typeof (m as { content?: unknown }).content === "string",
    )
  );
}

/**
 * Assigns provenance at the boundary. `operator` is the honest level: a human
 * typed it. That is a statement about ORIGIN, not about privilege — a user
 * asking for something they may not do is refused by permissions, not by
 * being trusted less.
 */
export function asOperatorMessages(messages: ClientMessage[]): LlmChatMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
    trust: "operator" as const,
    source: "http:/api/missions",
  }));
}

export const INVALID_MESSAGES_REASON =
  "requires { messages: { role, content }[] } — role must be system|user|assistant, and messages " +
  "may not carry `trust` or `source`: provenance is assigned by the kernel, not by the caller";
