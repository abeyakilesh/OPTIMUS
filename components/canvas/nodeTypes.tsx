/**
 * THE RENDERER REGISTRY. One entry per NodeType.
 *
 * This file is why the canvas is an architecture and not a mission dashboard:
 * a video model, a human approval or a nested subgraph is a row here. The
 * canvas core never learns what any of them are — it looks up `type`, gets a
 * glyph, and draws the same card.
 *
 * ⚠️ COLOUR IS RESERVED FOR STATE, NOT FOR TYPE. The first draft of this file
 * gave each of twenty node types its own hue and was correctly failed by
 * `integrity.test.ts` — the palette is deliberately five colours plus three
 * semantic ones, and a per-type rainbow is exactly the drift that test exists
 * to prevent.
 *
 * It is also better design. On a canvas, the question a person asks is "what
 * is happening" far more often than "what kind of node is this" — and TYPE is
 * already carried by the glyph and the sublabel. Spending colour on type would
 * leave nothing legible to spend on state.
 *
 * Only `capability` has real data behind it today. The rest are registered so
 * the shape is proven before the work arrives; the PROJECTOR is what refuses
 * to emit a node type nothing produced.
 */

import type { NodeType, ExecState } from "@/lib/graph/model";

export interface NodeChrome {
  /** Single glyph — themeable, and no icon dependency to pin. */
  icon: string;
  /** `true` for nodes that act on the world; they get the accent plate. */
  accented?: boolean;
}

const REGISTRY: Record<string, NodeChrome> = {
  capability: { icon: "⚙", accented: true },
  agent:      { icon: "◈", accented: true },
  model:      { icon: "◉", accented: true },
  tool:       { icon: "⚒", accented: true },
  api:        { icon: "⇄", accented: true },
  browser:    { icon: "◍", accented: true },
  terminal:   { icon: "▮", accented: true },
  code:       { icon: "⌘", accented: true },
  rag:        { icon: "◎", accented: true },
  workflow:   { icon: "❐", accented: true },
  subgraph:   { icon: "⊞", accented: true },
  mission:    { icon: "▶", accented: true },
  trigger:    { icon: "⚡", accented: true },
  scheduler:  { icon: "◷", accented: true },
  // Passive nodes — things that hold or await rather than act.
  dataset:    { icon: "▤" },
  file:       { icon: "▢" },
  database:   { icon: "▦" },
  human:      { icon: "☺" },
  approval:   { icon: "✓" },
  decision:   { icon: "◆" },
  condition:  { icon: "⑂" },
  note:       { icon: "✎" },
};

const FALLBACK: NodeChrome = { icon: "○" };

/** Never throws on an unknown type — a kernel may grow one before this file does. */
export function chromeFor(type: NodeType): NodeChrome {
  return REGISTRY[type] ?? FALLBACK;
}

/**
 * Execution state → palette token. Deliberately separate from node type: the
 * same kind of node looks different running than blocked, and a type whose
 * colour encoded its state could not show both.
 *
 * Every value is a token from `app/globals.css`. No raw hex, so the canvas
 * cannot drift away from the rest of the product.
 */
export const STATE_CHROME: Record<ExecState, { colour: string; label: string }> = {
  idle:      { colour: "var(--color-muted)", label: "idle" },
  queued:    { colour: "var(--color-muted)", label: "queued" },
  running:   { colour: "var(--color-run)",   label: "running" },
  retrying:  { colour: "var(--color-run)",   label: "retrying" },
  waiting:   { colour: "var(--color-run)",   label: "waiting" },
  paused:    { colour: "var(--color-muted)", label: "paused" },
  blocked:   { colour: "var(--color-fail)",  label: "blocked" },
  failed:    { colour: "var(--color-fail)",  label: "failed" },
  cancelled: { colour: "var(--color-muted)", label: "cancelled" },
  completed: { colour: "var(--color-pass)",  label: "verified" },
};
