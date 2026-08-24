/**
 * Box #7 (chat → mission bridge), smallest honest slice: one HTTP call in,
 * one real kernel step out. No planning, no multi-step mission yet — this
 * proves the wire from the browser through the kernel to a real model and
 * back, before anything gets built on top of it.
 *
 * Talks to the real llm.chat capability (kernel/capabilities/omniroute/chat.ts),
 * which itself talks to a real, already-running OmniRoute instance. This
 * route does NOT fake a reply when that instance is unreachable — Directive
 * #4: an unavailable capability is reported as unavailable, never faked.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Broker } from "@/kernel/broker";
import { Harness } from "@/kernel/harness";
import { MemoryArtifactStore } from "@/kernel/artifacts";
import {
  llmChat,
  llmChatSucceeded,
  type LlmChatMessage,
  type LlmChatOutput,
} from "@/kernel/capabilities/omniroute/chat";

export const dynamic = "force-dynamic";

const OMNIROUTE_BASE_URL = process.env.OMNIROUTE_BASE_URL ?? "http://127.0.0.1:20128";
const OMNIROUTE_MODEL = process.env.OMNIROUTE_DEFAULT_MODEL ?? "ollama/llama3.2:latest";

export interface ChatApiResponse {
  ok: boolean;
  content?: string;
  reason?: string;
}

function isValidMessages(value: unknown): value is LlmChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (m) =>
        m &&
        typeof m === "object" &&
        typeof (m as { role?: unknown }).role === "string" &&
        typeof (m as { content?: unknown }).content === "string",
    )
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "invalid JSON body" } satisfies ChatApiResponse,
      { status: 400 },
    );
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!isValidMessages(messages)) {
    return NextResponse.json(
      { ok: false, reason: "requires { messages: { role, content }[] }" } satisfies ChatApiResponse,
      { status: 400 },
    );
  }

  const broker = new Broker();
  broker.register(llmChat);
  broker.registerCheck(llmChatSucceeded);
  const harness = new Harness({ broker, store: new MemoryArtifactStore() });

  const outcome = await harness.runStep({
    id: "chat",
    capabilityId: "llm.chat",
    input: { baseUrl: OMNIROUTE_BASE_URL, model: OMNIROUTE_MODEL, messages },
    dependsOn: [],
    checks: ["llm.chatSucceeded"],
  });

  if (outcome.status !== "passed") {
    const reason = outcome.evidence.checks[0]?.reason ?? "the model layer did not respond";
    return NextResponse.json({ ok: false, reason } satisfies ChatApiResponse, { status: 503 });
  }

  const output = outcome.output as LlmChatOutput;
  return NextResponse.json({ ok: true, content: output.content } satisfies ChatApiResponse);
}
