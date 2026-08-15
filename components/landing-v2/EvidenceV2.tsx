"use client";

import { useState } from "react";
import { Reveal, InViewGroup } from "./fx";
import { vars } from "./style";
import { Check } from "../landing/Icons";

type RowState = "pass" | "run" | "idle";
type Tab = {
  key: string;
  label: string;
  caption: string;
  rows: { text: string; state: RowState }[];
};

const TABS: Tab[] = [
  {
    key: "plan",
    label: "Plan",
    caption: "The steps, approved before anything ran.",
    rows: [
      { text: "Collect pricing pages for 9 competitors", state: "pass" },
      { text: "Normalise tiers into one schema", state: "pass" },
      { text: "Flag anything that changed since March", state: "pass" },
      { text: "Render comparison chart", state: "run" },
      { text: "Write the summary", state: "idle" },
    ],
  },
  {
    key: "diff",
    label: "Diff",
    caption: "Exactly what changed, line by line.",
    rows: [
      { text: "+ components/PricingChart.tsx  (new, 84 lines)", state: "pass" },
      { text: "~ lib/normalise.ts  +21 −4", state: "pass" },
      { text: "~ data/competitors.json  +148 rows", state: "pass" },
      { text: "− scratch/tmp-scrape.csv  (cleaned up)", state: "pass" },
    ],
  },
  {
    key: "checks",
    label: "Checks",
    caption: "A step is done when a check passes, not when the model says so.",
    rows: [
      { text: "typecheck · 0 errors", state: "pass" },
      { text: "unit · 34 passed, 0 failed", state: "pass" },
      { text: "schema · 148/148 rows valid", state: "pass" },
      { text: "visual diff · within tolerance", state: "pass" },
      { text: "permission audit · no escapes", state: "pass" },
    ],
  },
  {
    key: "artifacts",
    label: "Artifacts",
    caption: "Content-addressed, so a result can never quietly change.",
    rows: [
      { text: "a41c9e · competitors.normalised.json", state: "pass" },
      { text: "b7702f · pricing-comparison.svg", state: "pass" },
      { text: "c1d8a3 · run-trace.log", state: "pass" },
      { text: "d90e55 · skill: competitor-teardown@1", state: "pass" },
    ],
  },
];

const GUARANTEES = [
  { n: "01", t: "Permission", d: "A step declares what it needs. It gets nothing else — no ambient credentials, no shared token." },
  { n: "02", t: "Sandbox", d: "Every action runs isolated. The blast radius is defined before the action, not discovered after it." },
  { n: "03", t: "Verify", d: "Output is checked against a real assertion. Unverified work never reaches you as 'done'." },
  { n: "04", t: "Log", d: "The full trace is kept — inputs, tool calls, timings, exit codes. Replayable, not summarised." },
  { n: "05", t: "Rollback", d: "Anything OPTIMUS did, OPTIMUS can undo. Including the parts that succeeded." },
];

const dot = (s: RowState) =>
  s === "pass" ? "bg-pass" : s === "run" ? "bg-run" : "bg-line-2";

export default function EvidenceV2() {
  const [tab, setTab] = useState(0);
  const active = TABS[tab];

  return (
    <section id="proof" className="border-b border-line bg-mist">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {/* ══ left — sticky ══ */}
          <div className="fx-stack self-start" style={vars({ "--fx-top": "112px" })}>
            <Reveal variant="up">
              <p className="label text-cyan-dark">Proof</p>
            </Reveal>
            <Reveal variant="up" delay={80}>
              <h2 className="font-display mt-3 max-w-[14ch] text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.08] text-ink">
                Every mission ships with its receipts.
              </h2>
            </Reveal>
            <Reveal variant="up" delay={150}>
              <p className="mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-body">
                The gap between &ldquo;the AI said it worked&rdquo; and
                &ldquo;it works&rdquo; is where every agent product falls over.
                OPTIMUS closes it with five guarantees wired into the kernel —
                not five checkboxes in a settings page.
              </p>
            </Reveal>

            {/* E48 — accordion */}
            <div className="mt-8 space-y-px overflow-hidden rounded-xl border border-line bg-line">
              {GUARANTEES.map((g, i) => (
                <Guarantee key={g.n} {...g} defaultOpen={i === 0} />
              ))}
            </div>
          </div>

          {/* ══ right — evidence panel ══ */}
          <Reveal variant="up" delay={120}>
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,13,14,.04),0_36px_80px_-56px_rgba(11,13,14,.45)]">
              {/* E49 — sliding tab indicator */}
              <div className="relative border-b border-line">
                <div role="tablist" aria-label="Evidence type" className="grid grid-cols-4">
                  {TABS.map((t, i) => (
                    <button
                      key={t.key}
                      role="tab"
                      onClick={() => setTab(i)}
                      aria-selected={i === tab}
                      className={`px-2 py-3.5 text-[13px] font-medium transition-colors ${
                        i === tab ? "text-ink" : "text-muted hover:text-body"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <span
                  aria-hidden
                  className="fx-tabline absolute bottom-0 left-0 h-[2px] bg-cyan"
                  style={{ width: `${100 / TABS.length}%`, transform: `translateX(${tab * 100}%)` }}
                />
              </div>

              <div className="p-5">
                <p className="text-[13px] text-muted">{active.caption}</p>

                {/* E41 — rows animate in on every tab change (keyed remount) */}
                <ul key={active.key} className="mt-4 space-y-px overflow-hidden rounded-xl border border-line bg-line">
                  {active.rows.map((r, i) => (
                    <li
                      key={r.text}
                      style={{ animationDelay: `${i * 55}ms` }}
                      className="fx-line-in flex items-center gap-2.5 bg-white px-3.5 py-3"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot(r.state)}`}
                      />
                      <span className="min-w-0 flex-1 truncate font-data text-[11.5px] text-body">
                        {r.text}
                      </span>
                      {r.state === "pass" && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-pass" />
                      )}
                      {r.state === "run" && (
                        <span className="shrink-0 font-data text-[9.5px] uppercase tracking-widest text-run">
                          running
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {/* E40 — coverage bar fills on view */}
                <InViewGroup className="mt-5">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-muted">Steps with a passing check</span>
                    <span className="font-data font-semibold text-pass">
                      {active.key === "plan" ? "3 / 5" : "100%"}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                    <div
                      style={vars({ "--fx-w": active.key === "plan" ? "60%" : "100%" })}
                      className="fx-fill h-full rounded-full bg-pass"
                    />
                  </div>
                </InViewGroup>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Guarantee({
  n,
  t,
  d,
  defaultOpen,
}: {
  n: string;
  t: string;
  d: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="font-data text-[10px] font-semibold text-cyan-dark">{n}</span>
        <span className="flex-1 text-[13.5px] font-medium text-ink">{t}</span>
        <span
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-faint transition-transform duration-300 ${
            open ? "rotate-45" : ""
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div className="fx-acc" data-open={open}>
        <div>
          <p className="px-4 pb-3.5 pl-[2.6rem] text-[13px] leading-relaxed text-muted">{d}</p>
        </div>
      </div>
    </div>
  );
}
