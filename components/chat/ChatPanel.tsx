"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "@/components/landing/Icons";
import type { MissionApiResult } from "@/app/api/missions/route";
import type { CheckResult, MissionState } from "@/kernel/types";

type Message = { role: "user" | "assistant"; content: string };
type Status = "idle" | "sending" | "unavailable";
type StepEvidence = MissionApiResult["steps"][number];

interface MissionDetailResponse {
  ok: boolean;
  reason?: string;
  content?: string;
  mission?: MissionState;
}

const SUGGESTIONS = [
  "What can OPTIMUS actually do right now?",
  "What's the difference between a chat reply and a mission?",
  "What's 17 × 24?",
  "Write a two-line haiku about verification.",
];

interface Props {
  /** Mission id selected from the sidebar, or null for a fresh conversation. */
  missionId: string | null;
  /** Called with the new mission's id right after it's created. */
  onMissionCreated: (id: string) => void;
}

export default function ChatPanel({ missionId, onMissionCreated }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [lastEvidence, setLastEvidence] = useState<StepEvidence[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Loading a past mission from the sidebar replaces the whole view with
  // its real, persisted transcript — not a re-run. A fresh missionId=null
  // instance (see ChatShell's `key`) needs no reset here; it already starts
  // empty.
  useEffect(() => {
    if (!missionId) return;

    let cancelled = false;
    (async () => {
      setStatus("sending"); // reuse as a generic "loading" state while fetching
      const res = await fetch(`/api/missions/${missionId}`);
      const data = (await res.json()) as MissionDetailResponse;
      if (cancelled) return;

      if (!data.ok || !data.mission) {
        setStatus("unavailable");
        setErrorReason(data.reason ?? "could not load this mission");
        return;
      }

      const mission = data.mission;
      const chatStep = mission.steps.chat;
      const inputMessages = (chatStep?.spec.input as { messages?: Message[] } | undefined)?.messages;
      const userText = inputMessages?.at(-1)?.content ?? mission.spec.objective;
      const next: Message[] = [{ role: "user", content: userText }];
      if (mission.status === "green" && data.content) {
        next.push({ role: "assistant", content: data.content });
        setStatus("idle");
      } else {
        setStatus("unavailable");
        setErrorReason(chatStep?.evidence?.checks[0]?.reason ?? "mission did not complete");
      }
      setMessages(next);
      setLastEvidence(
        Object.values(mission.steps).map((s) => ({
          id: s.spec.id,
          capabilityId: s.spec.capabilityId,
          status: s.evidence ? "finished" : "did-not-run",
          durationMs: s.evidence?.durationMs,
          checks: (s.evidence?.checks ?? []) as CheckResult[],
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [missionId]);

  async function send(overrideText?: string) {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || status === "sending") return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setStatus("sending");
    setErrorReason(null);
    setLastEvidence(null);

    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as MissionApiResult;

      onMissionCreated(data.missionId);
      setLastEvidence(data.steps);

      if (!res.ok || !data.ok) {
        setStatus("unavailable");
        setErrorReason(data.reason ?? `request failed (${res.status})`);
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: data.content ?? "" }]);
      setStatus("idle");
    } catch (error) {
      setStatus("unavailable");
      setErrorReason(error instanceof Error ? error.message : "network error");
    }
  }

  const isEmpty = messages.length === 0 && status === "idle";

  return (
    <div className="mx-auto flex h-full w-full max-w-[720px] flex-col px-6">
      {isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center pb-20">
          <div className="w-full max-w-[520px]">
            <h1 className="text-center text-[22px] font-semibold tracking-[-0.02em] text-ink">
              What do you want to <span className="text-cyan-dark">ask</span>?
            </h1>
            <p className="mx-auto mt-1.5 max-w-[42ch] text-center text-[12.5px] leading-relaxed text-muted">
              A real reply from a real local model, through the real kernel — not
              a canned answer. No mission execution behind this yet, just
              conversation.
            </p>

            <p className="mt-6 text-[12px] font-medium text-ink">Try asking</p>
            <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                    className="w-full rounded-lg border border-line bg-white p-2.5 text-left text-[12px] leading-snug text-body transition hover:border-cyan/45 hover:text-ink"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto py-8" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <p className="label mb-1 text-faint">{m.role === "user" ? "you" : "optimus"}</p>
              <span
                data-role={m.role}
                className={`inline-block max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2.5 text-[14px] ${
                  m.role === "user"
                    ? "bg-ink text-white"
                    : "border border-line bg-white text-ink"
                }`}
              >
                {m.content}
              </span>
              {m.role === "assistant" && lastEvidence && i === messages.length - 1 && (
                <EvidenceCaption steps={lastEvidence} />
              )}
            </div>
          ))}

          {status === "sending" && (
            <div className="text-left">
              <p className="label mb-1 text-faint">optimus</p>
              <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-[14px] text-muted">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-run" />
                thinking
              </span>
            </div>
          )}

          {status === "unavailable" && (
            <div className="rounded-lg border border-line-2 bg-mist px-4 py-3 text-[13px] text-muted">
              <span className="font-data font-medium text-ink">model layer unavailable</span>
              {" — "}
              {errorReason}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line py-4">
        <div className="flex items-center gap-2 rounded-xl border border-line-2 bg-white p-1.5 shadow-[0_1px_2px_rgba(11,13,14,.03)] focus-within:border-cyan">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Message OPTIMUS…"
            className="flex-1 bg-transparent px-3 py-2 text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <button
            onClick={() => send()}
            disabled={status === "sending" || !input.trim()}
            aria-label="Send"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-white transition hover:bg-ink/88 disabled:opacity-30"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The verification receipt, not a decorative caption — real check ids and
 * pass/fail straight from the mission's actual Evidence. This is box #8's
 * spirit (see real proof, not a black box) without inventing a fake
 * multi-step animation for a mission that only has one step today.
 */
function EvidenceCaption({ steps }: { steps: StepEvidence[] }) {
  return (
    <p className="mt-1 text-[10.5px] text-faint">
      {steps.map((s) => (
        <span key={s.id} className="mr-2">
          {s.checks.map((c) => (
            <span key={c.checkId} className={c.passed ? "text-pass" : "text-ink"}>
              {c.passed ? "✓" : "✕"} {c.checkId}
            </span>
          ))}
          {s.durationMs !== undefined && <span className="ml-1">· {s.durationMs}ms</span>}
        </span>
      ))}
    </p>
  );
}
