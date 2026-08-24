"use client";

import { useState } from "react";
import type { ChatApiResponse } from "@/app/api/chat/route";

type Message = { role: "user" | "assistant"; content: string };
type Status = "idle" | "sending" | "unavailable";

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || status === "sending") return;

    const next = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(next);
    setInput("");
    setStatus("sending");
    setErrorReason(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as ChatApiResponse;

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

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-[720px] flex-col px-6">
      <div className="flex-1 space-y-4 overflow-y-auto py-8" aria-live="polite">
        {messages.length === 0 && status !== "unavailable" && (
          <p className="text-[14px] text-muted">
            This goes through the real OPTIMUS kernel and a real local model —
            not a canned reply. If nothing is running behind it, you&apos;ll
            see an honest error, not a fake answer.
          </p>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
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
          </div>
        ))}

        {status === "sending" && (
          <div className="text-left">
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

      <div className="flex gap-2 border-t border-line py-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message OPTIMUS…"
          className="flex-1 rounded-lg border border-line-2 px-4 py-2.5 text-[14px] text-ink outline-none focus:border-cyan"
        />
        <button
          onClick={send}
          disabled={status === "sending" || !input.trim()}
          className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-white transition hover:bg-ink/88 disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
