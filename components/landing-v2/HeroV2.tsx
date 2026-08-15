"use client";

import { Words, Typewriter, Reveal, Magnetic, Ripple, Tilt, Motes, LiveLog, Parallax, InViewGroup, type LogLine } from "./fx";
import { vars } from "./style";
import {
  Logo,
  Check,
  ArrowRight,
  BrowserIcon,
  CodeIcon,
  DataIcon,
  ResearchIcon,
  DesignIcon,
  WorkflowIcon,
  MissionIcon,
} from "../landing/Icons";

const OBJECTIVES = [
  "Find every competitor that raised in Q3 and chart their pricing",
  "Fix the checkout race condition and prove it with a test",
  "Turn these 40 PDFs into a searchable dataset",
  "Rebuild the pricing page and ship it to staging",
];

const LOG: LogLine[] = [
  { t: "09:14:02", msg: "Plan accepted — 6 steps, 3 workspaces", kind: "info" },
  { t: "09:14:07", msg: "browser · opened 12 sources, 9 kept", kind: "run" },
  { t: "09:14:23", msg: "extract · 148 rows → artifact #a41c", kind: "run" },
  { t: "09:14:31", msg: "verify · schema + row count matched", kind: "pass" },
  { t: "09:14:38", msg: "code · chart.tsx written, typecheck clean", kind: "run" },
  { t: "09:14:52", msg: "verify · visual diff approved", kind: "pass" },
  { t: "09:15:04", msg: "evidence · 4 artifacts, 2 proofs sealed", kind: "pass" },
  { t: "09:15:09", msg: "skill saved — replay in one click", kind: "info" },
];

const BADGES = ["Free forever tier", "Bring your own model key", "Runs on your machine"];

const CHIPS = [
  { Icon: ResearchIcon, label: "Research", top: "6%", left: "-7%", dur: "6.5s", d: "0s" },
  { Icon: CodeIcon, label: "Code", top: "44%", left: "-11%", dur: "7.4s", d: ".8s" },
  { Icon: WorkflowIcon, label: "Automate", top: "84%", left: "4%", dur: "6.9s", d: "1.6s" },
  { Icon: DesignIcon, label: "Design", top: "88%", left: "76%", dur: "7.8s", d: ".4s" },
];

export default function HeroV2() {
  return (
    <section id="top" className="fx-noise relative overflow-hidden">
      {/* ── ambient layers (E10–E14, E57) ── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="fx-conic-bg absolute -top-[46%] left-1/2 h-[900px] w-[900px] -translate-x-1/2 rounded-full opacity-45 blur-3xl" />
        <div className="fx-aurora-a absolute -top-40 right-[-10%] h-[620px] w-[620px] rounded-full blur-2xl" />
        <div className="fx-aurora-b absolute -bottom-56 left-[-14%] h-[560px] w-[560px] rounded-full blur-2xl" />
        <Parallax amount={70} className="absolute inset-x-0 -top-24 h-[140%]">
          <div className="fx-grid h-full w-full opacity-70" />
        </Parallax>
        <Motes className="absolute inset-0 h-full w-full" count={30} />
      </div>

      <div className="mx-auto grid max-w-[1180px] items-center gap-16 px-6 pb-24 pt-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:pb-28 lg:pt-20">
        {/* ══ copy ══ */}
        <div>
          {/* eyebrow — E29 ping + E30 shimmer */}
          <Reveal variant="down">
            <span className="fx-shimmer inline-flex items-center gap-2 rounded-full border border-line bg-white/70 py-1 pl-2 pr-3 backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
              </span>
              <span className="label text-cyan-dark">Kernel build in progress</span>
            </span>
          </Reveal>

          {/* E09 — masked word-by-word roll-up */}
          <h1 className="font-display mt-6 text-[clamp(2.6rem,6.2vw,4.15rem)] leading-[0.98] text-ink">
            <Words text="State the objective." step={58} />
            <br />
            <Words text="Watch it" start={280} step={58} />{" "}
            <span className="fx-shine-text">
              <Words text="get done." start={420} step={58} />
            </span>
          </h1>

          <Reveal variant="up" delay={620}>
            <p className="mt-6 max-w-[47ch] text-[16.5px] leading-[1.65] text-body">
              OPTIMUS plans the work, runs it across browser, code, data and
              design, then <span className="font-medium text-ink">proves the
              result</span>. Every finished mission is saved as a skill you can
              run again.
            </p>
          </Reveal>

          <Reveal variant="up" delay={740}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              {/* E56 magnetic + E23 sheen + E24 ripple */}
              <Magnetic strength={0.22}>
                <Ripple
                  href="#start"
                  className="fx-sheen group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[15px] font-medium text-white transition hover:bg-ink/90"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    Start a mission
                    <ArrowRight className="fx-nudge h-4 w-4" />
                  </span>
                </Ripple>
              </Magnetic>

              <Magnetic strength={0.16}>
                <a
                  href="#how"
                  className="group inline-flex items-center gap-2.5 rounded-full border border-line-2 bg-white/70 px-5 py-3.5 text-[15px] font-medium text-ink backdrop-blur transition hover:border-cyan/50"
                >
                  <span className="relative grid h-6 w-6 place-items-center rounded-full bg-sky">
                    <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan/50" />
                    <span className="relative block h-0 w-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-cyan-dark" />
                  </span>
                  Watch the loop
                </a>
              </Magnetic>
            </div>
          </Reveal>

          <Reveal variant="up" delay={860}>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
              {BADGES.map((b) => (
                <li key={b} className="flex items-center gap-1.5 text-[13px] text-muted">
                  <Check className="h-3.5 w-3.5 text-pass" />
                  {b}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* ══ live console ══ */}
        <Reveal variant="scale" delay={300} className="relative">
          <div className="relative">
            {/* E39 — floating capability chips orbiting the console */}
            {CHIPS.map(({ Icon, label, top, left, dur, d }) => (
              <span
                key={label}
                style={vars({ top, left, "--fx-dur": dur, "--fx-d": d })}
                className="fx-float absolute z-20 hidden items-center gap-1.5 rounded-full border border-line bg-white/90 px-2.5 py-1.5 text-[11.5px] font-medium text-body shadow-[0_8px_24px_-14px_rgba(11,13,14,.4)] backdrop-blur xl:inline-flex"
              >
                <Icon className="h-3.5 w-3.5 text-cyan-dark" />
                {label}
              </span>
            ))}

            {/* E19 tilt + E20 spotlight + E21 edge glow */}
            <Tilt max={4} className="relative z-10">
              <div className="fx-spot fx-edge overflow-hidden rounded-2xl border border-line bg-white/85 shadow-[0_1px_2px_rgba(11,13,14,.04),0_40px_90px_-50px_rgba(11,13,14,.5)] backdrop-blur-xl">
                {/* E14 — scan line */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px overflow-visible"
                >
                  <div className="fx-scan h-px w-full opacity-60" />
                </div>

                {/* chrome */}
                <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                  <Logo />
                  <span className="ml-1 hidden items-center gap-1.5 rounded-full border border-line px-2 py-0.5 sm:flex">
                    <span className="h-1.5 w-1.5 rounded-full bg-pass" />
                    <span className="font-data text-[10px] text-muted">kernel online</span>
                  </span>
                  <div className="ml-auto flex items-center gap-2 text-faint">
                    {[MissionIcon, BrowserIcon, DataIcon].map((I, i) => (
                      <I key={i} className="h-4 w-4" />
                    ))}
                    <span className="h-6 w-6 rounded-full bg-sky-2" />
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  {/* objective bar — E53 typewriter */}
                  <div className="rounded-xl border border-line-2 bg-mist/60 px-3 py-2.5">
                    <p className="label text-faint">Objective</p>
                    <p className="mt-1 min-h-[2.6em] text-[13px] leading-snug text-ink">
                      <Typewriter words={OBJECTIVES} />
                    </p>
                  </div>

                  <InViewGroup className="space-y-3">
                    {/* active mission — E26 rotating ring + E40 fill + E35 eq */}
                    <div className="fx-ring rounded-xl border border-line bg-white p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="flex items-end gap-[2px]">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              style={vars({ "--fx-d": `${i * 0.13}s`, "--fx-dur": "0.85s" })}
                              className="fx-eq block h-3 w-[2.5px] rounded-full bg-cyan"
                            />
                          ))}
                        </span>
                        <p className="text-[13px] font-semibold text-ink">
                          Competitor pricing teardown
                        </p>
                        <span className="ml-auto font-data text-[11px] font-semibold text-cyan-dark">
                          68%
                        </span>
                      </div>

                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sky-2">
                        <div
                          style={vars({ "--fx-w": "68%", "--fx-d": "400ms" })}
                          className="fx-fill h-full rounded-full bg-cyan"
                        />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        <span className="fx-beat-run rounded-full bg-run-soft/60 px-2 py-0.5 font-data text-[10px] text-run">
                          step 4 running
                        </span>
                        <span className="rounded-full border border-pass/35 bg-pass-soft/50 px-2 py-0.5 font-data text-[10px] text-pass">
                          3 proofs passed
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              style={vars({ "--fx-d": `${i * 0.16}s` })}
                              className="fx-typing block h-1 w-1 rounded-full bg-faint"
                            />
                          ))}
                        </span>
                      </div>
                    </div>

                    {/* E58 — live log stream */}
                    <div className="rounded-xl border border-line bg-ink/[0.015] p-3">
                      <div className="flex items-center justify-between">
                        <p className="label text-faint">Execution trace</p>
                        <span className="label text-faint/70">live</span>
                      </div>
                      <LiveLog lines={LOG} visible={5} intervalMs={1600} className="mt-1.5" />
                    </div>

                    {/* queued row — E30 shimmer skeleton */}
                    <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-line-2 text-faint">
                        <span className="h-1.5 w-1.5 rounded-full bg-faint" />
                      </span>
                      <span className="fx-shimmer h-2 flex-1 rounded-full bg-sky-2" />
                      <span className="shrink-0 font-data text-[10px] text-faint">queued</span>
                    </div>
                  </InViewGroup>
                </div>
              </div>
            </Tilt>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
