/**
 * THE RENDERER REGISTRY. One row per NodeType, one row per ExecState.
 *
 * This is why the canvas is an architecture and not a mission dashboard:
 * a video model, a human approval or a nested subgraph is a ROW here, rendered
 * by the same `GenericNode`. The canvas core never learns what any of them are.
 *
 * ⚠️ COLOUR IS RESERVED FOR STATE, NOT TYPE. An earlier draft gave each of
 * twenty types its own hue and was correctly failed by `integrity.test.ts` —
 * the palette is five colours plus three semantic ones, and a per-type rainbow
 * is exactly the drift that test exists to prevent. Type is carried by the
 * icon; state gets the colour, because "what is happening" is the question a
 * person asks far more often than "what kind of node is this".
 *
 * Only `capability` has real data behind it today. The rest are registered so
 * the shape is proven before the work arrives; the PROJECTOR is what refuses
 * to emit a node type nothing produced.
 */

import {
  Bot, Boxes, Wrench, Globe, Code2, Chrome, Terminal, Database, FileText,
  Table2, Brain, User, CheckCircle2, GitBranch, Split, Zap, Clock, Workflow,
  Layers, Play, StickyNote, Circle, type LucideIcon,
} from "lucide-react";
import type { NodeType, ExecState } from "@/lib/graph/model";

export interface NodeChrome {
  Icon: LucideIcon;
  /** Nodes that ACT on the world get the accent plate; passive ones do not. */
  accented?: boolean;
}

const REGISTRY: Record<string, NodeChrome> = {
  capability: { Icon: Wrench, accented: true },
  agent:      { Icon: Bot, accented: true },
  model:      { Icon: Boxes, accented: true },
  tool:       { Icon: Wrench, accented: true },
  api:        { Icon: Globe, accented: true },
  code:       { Icon: Code2, accented: true },
  browser:    { Icon: Chrome, accented: true },
  terminal:   { Icon: Terminal, accented: true },
  rag:        { Icon: Brain, accented: true },
  workflow:   { Icon: Workflow, accented: true },
  subgraph:   { Icon: Layers, accented: true },
  mission:    { Icon: Play, accented: true },
  trigger:    { Icon: Zap, accented: true },
  scheduler:  { Icon: Clock, accented: true },
  dataset:    { Icon: Table2 },
  file:       { Icon: FileText },
  database:   { Icon: Database },
  human:      { Icon: User },
  approval:   { Icon: CheckCircle2 },
  decision:   { Icon: Split },
  condition:  { Icon: GitBranch },
  note:       { Icon: StickyNote },
};

const FALLBACK: NodeChrome = { Icon: Circle };

/** Never throws on an unknown type — a kernel may grow one before this file does. */
export function chromeFor(type: NodeType): NodeChrome {
  return REGISTRY[type] ?? FALLBACK;
}

/** Every value is a palette token from app/globals.css. No raw hex. */
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

/**
 * Group region tints. Deliberately WASHES, not palette hues — a region is a
 * background a person reads nodes on top of, so it must never compete with the
 * state colour carried by the nodes inside it.
 */
export const GROUP_TINTS = [
  { bg: "color-mix(in srgb, var(--color-cyan) 5%, transparent)",  border: "color-mix(in srgb, var(--color-cyan) 22%, transparent)",  text: "var(--color-cyan-dark)" },
  { bg: "color-mix(in srgb, var(--color-pass) 5%, transparent)",  border: "color-mix(in srgb, var(--color-pass) 22%, transparent)",  text: "var(--color-pass)" },
  { bg: "color-mix(in srgb, var(--color-run) 5%, transparent)",   border: "color-mix(in srgb, var(--color-run) 22%, transparent)",   text: "var(--color-run)" },
  { bg: "color-mix(in srgb, var(--color-fail) 4%, transparent)",  border: "color-mix(in srgb, var(--color-fail) 20%, transparent)",  text: "var(--color-fail)" },
  { bg: "color-mix(in srgb, var(--color-ink) 4%, transparent)",   border: "color-mix(in srgb, var(--color-ink) 14%, transparent)",   text: "var(--color-body)" },
  { bg: "color-mix(in srgb, var(--color-cyan) 8%, transparent)",  border: "color-mix(in srgb, var(--color-cyan) 26%, transparent)",  text: "var(--color-cyan-dark)" },
] as const;

/** The left rail's palette — what a user can add. Order is deliberate. */
export const PALETTE: { type: NodeType; label: string }[] = [
  { type: "agent", label: "Agent" },
  { type: "model", label: "Model" },
  { type: "tool", label: "Tool" },
  { type: "api", label: "API" },
  { type: "dataset", label: "Data" },
  { type: "file", label: "File" },
  { type: "human", label: "Human" },
  { type: "condition", label: "Condition" },
  { type: "subgraph", label: "Subgraph" },
  { type: "note", label: "Note" },
];
