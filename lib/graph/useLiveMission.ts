"use client";

/**
 * Runs a mission and folds its events into a graph AS THEY ARRIVE.
 *
 * The browser applies the SAME `applyEvent` the CLI and the API use. That is
 * the whole reason a live view cannot drift from a replayed one: there is one
 * fold, and three callers of it. A hook that maintained its own idea of node
 * state would be a second source of truth, and the two would disagree the
 * first time an event type changed.
 */

import { useCallback, useRef, useState } from "react";
import type { KernelEvent } from "@/kernel/events";
import type { MissionSpec } from "@/kernel/types";
import { applyEvent, projectSpec } from "./projector";
import type { Graph } from "./model";

export type RunPhase = "idle" | "running" | "done" | "failed";

export interface LiveMission {
  graph: Graph | null;
  events: KernelEvent[];
  phase: RunPhase;
  error?: string;
  run: (repos: string[]) => Promise<void>;
  cancel: () => void;
}

export function useLiveMission(seed?: { graph: Graph; events: KernelEvent[] }): LiveMission {
  const [graph, setGraph] = useState<Graph | null>(seed?.graph ?? null);
  const [events, setEvents] = useState<KernelEvent[]>(seed?.events ?? []);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPhase("idle");
  }, []);

  const run = useCallback(async (repos: string[]) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;

    setPhase("running");
    setError(undefined);
    setEvents([]);
    setGraph(null);

    let response: Response;
    try {
      response = await fetch("/api/graph/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repos }),
        signal: controller.signal,
      });
    } catch (e) {
      setPhase("failed");
      setError(String(e));
      return;
    }

    if (!response.ok || !response.body) {
      const reason = await response.json().catch(() => ({ reason: `HTTP ${response.status}` }));
      setPhase("failed");
      setError((reason as { reason?: string }).reason ?? `HTTP ${response.status}`);
      return;
    }

    // Hand-parsed rather than EventSource: EventSource cannot POST, and the
    // repo list has to reach the server somehow. The format is small and the
    // parsing is the boring half of SSE.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let live: Graph | null = null;

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Frames are separated by a blank line; a partial tail stays buffered.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const nameLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!nameLine || !dataLine) continue;
          const name = nameLine.slice(7).trim();
          let payload: unknown;
          try {
            payload = JSON.parse(dataLine.slice(6));
          } catch {
            continue;
          }

          if (name === "mission") {
            const { spec } = payload as { spec: MissionSpec };
            live = projectSpec(spec);
            setGraph({ ...live });
          } else if (name === "kernel") {
            const event = payload as KernelEvent;
            setEvents((prev) => [...prev, event]);
            // Fold into a COPY so React sees a new object; the projector
            // mutates for the CLI's benefit, which is fine there and not here.
            live = applyEvent(live ? { ...live, nodes: [...live.nodes], edges: [...live.edges] } : ({} as Graph), event);
            setGraph({ ...live, nodes: [...live.nodes], edges: [...live.edges] });
          } else if (name === "done") {
            setPhase("done");
          } else if (name === "failed") {
            setPhase("failed");
            setError((payload as { reason?: string }).reason);
          }
        }
      }
      setPhase((p) => (p === "running" ? "done" : p));
    } catch (e) {
      if (!controller.signal.aborted) {
        setPhase("failed");
        setError(String(e));
      }
    }
  }, []);

  return { graph, events, phase, error, run, cancel };
}
