import { Harness } from "@/kernel/harness";
import type { CompilerRequest } from "@/kernel/planCompiler";
import type { LlmChatOutput } from "@/kernel/capabilities/omniroute/chat";

/**
 * The plan compiler's model call, made THROUGH the kernel rather than beside it.
 *
 * It would be shorter to fetch OmniRoute directly from the route. Going through
 * `llm.chat` buys four things that are not optional for a call whose output
 * decides which capabilities run:
 *
 *   · the input contract refuses a bad baseUrl before a request is assembled
 *   · K4 refuses the socket to anything off loopback
 *   · a budget bounds it, so a stuck compile cannot burn the request
 *   · the attempt is evidenced like any other step
 *
 * THE TWO MESSAGES ARE THE POINT. The instruction set is kernel-authored and
 * says so; the objective is operator-authored and says so. Merging them would
 * put a person's words inside a `trust: "kernel"` message, which is the
 * confusion #64 was filed about — and it would be introduced by the same PR
 * that lets a model choose capabilities.
 */
export function compilerAsk(
  harness: Harness,
  opts: { baseUrl: string; model: string },
): (request: CompilerRequest) => Promise<string> {
  return async ({ instructions, objective }) => {
    const outcome = await harness.runStep({
      id: "compile",
      capabilityId: "llm.chat",
      input: {
        baseUrl: opts.baseUrl,
        model: opts.model,
        messages: [
          { role: "system", content: instructions, trust: "kernel", source: "kernel/planCompiler.ts" },
          { role: "user", content: objective, trust: "operator", source: "http:/api/missions" },
        ],
      },
      dependsOn: [],
      checks: ["llm.chatSucceeded"],
    });

    if (outcome.status !== "passed") {
      const reason = outcome.evidence.checks.find((c) => !c.passed)?.reason ?? outcome.status;
      throw new Error(reason);
    }
    return (outcome.output as LlmChatOutput).content ?? "";
  };
}
