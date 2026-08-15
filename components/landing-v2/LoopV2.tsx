"use client";

import { Reveal, useSectionProgress } from "./fx";
import { vars } from "./style";
import {
  PlanIcon,
  ActIcon,
  VerifyIcon,
  EvidenceIcon,
  RememberIcon,
} from "../landing/Icons";

const STEPS = [
  { Icon: PlanIcon, name: "Plan", copy: "The objective becomes an explicit, editable list of steps — before anything runs." },
  { Icon: ActIcon, name: "Act", copy: "Each step executes inside its own sandbox, with only the permissions it asked for." },
  { Icon: VerifyIcon, name: "Verify", copy: "A step is not done because the model says so. It is done when a check passes." },
  { Icon: EvidenceIcon, name: "Evidence", copy: "Outputs, diffs, screenshots and logs are sealed and addressable forever." },
  { Icon: RememberIcon, name: "Remember", copy: "The whole verified run is saved as a skill you can replay or schedule." },
];

const R = 38;
const C = 2 * Math.PI * R;

/** Node coordinates on the ring, starting at 12 o'clock and going clockwise. */
const NODES = STEPS.map((_, i) => {
  const a = ((-90 + i * (360 / STEPS.length)) * Math.PI) / 180;
  return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) };
});

export default function LoopV2() {
  // E59 — scroll position inside this section drives the whole diagram.
  const { ref, p } = useSectionProgress<HTMLDivElement>();

  // Remap the middle 55% of the travel onto the 5 steps so the first and last
  // aren't skipped as the section enters and leaves the viewport.
  const t = Math.max(0, Math.min(1, (p - 0.22) / 0.55));
  const active = Math.min(STEPS.length - 1, Math.floor(t * STEPS.length));

  return (
    <section id="how" ref={ref} className="relative overflow-hidden border-b border-line bg-white">
      <div
        aria-hidden
        className="fx-aurora-b pointer-events-none absolute -right-40 top-1/4 -z-10 h-[520px] w-[520px] rounded-full blur-2xl"
      />

      <div className="mx-auto grid max-w-[1180px] items-center gap-16 px-6 py-24 lg:grid-cols-2">
        {/* ══ copy ══ */}
        <div>
          <Reveal variant="up">
            <p className="label text-cyan-dark">The loop</p>
          </Reveal>
          <Reveal variant="up" delay={80}>
            <h2 className="font-display mt-3 max-w-[15ch] text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.08] text-ink">
              Not answers. Outcomes you can check.
            </h2>
          </Reveal>
          <Reveal variant="up" delay={150}>
            <p className="mt-4 max-w-[48ch] text-[15.5px] leading-relaxed text-body">
              The same five phases run on every mission, from a one-line lookup
              to a week-long build. Scroll to walk through them.
            </p>
          </Reveal>

          <ol className="mt-9 space-y-1">
            {STEPS.map(({ Icon, name, copy }, i) => {
              const on = i === active;
              const done = i < active;
              return (
                <li
                  key={name}
                  className={`flex gap-3.5 rounded-xl border p-3 transition-all duration-500 ${
                    on
                      ? "border-cyan/40 bg-sky/60"
                      : "border-transparent bg-transparent"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition-all duration-500 ${
                      on
                        ? "scale-110 border-cyan/50 bg-white text-cyan-dark"
                        : done
                          ? "border-pass/30 bg-pass-soft/40 text-pass"
                          : "border-line bg-white text-faint"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-baseline gap-2 text-[14.5px] font-semibold text-ink">
                      {name}
                      <span className="font-data text-[10px] font-normal text-faint">
                        0{i + 1}
                      </span>
                      {done && (
                        <span className="font-data text-[9.5px] uppercase tracking-widest text-pass">
                          done
                        </span>
                      )}
                    </p>
                    <p
                      className={`mt-0.5 text-[13.5px] leading-relaxed transition-colors duration-500 ${
                        on ? "text-body" : "text-muted"
                      }`}
                    >
                      {copy}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* ══ ring ══ */}
        <div className="relative mx-auto aspect-square w-full max-w-[430px]">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
            {/* E37 — dashed current flowing around the track */}
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke="var(--color-line-2)"
              strokeWidth="0.35"
              strokeDasharray="1.4 2.6"
              className="fx-dash"
            />
            {/* scroll-linked progress arc */}
            <circle
              cx="50" cy="50" r={R}
              fill="none"
              stroke="var(--color-cyan)"
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - t)}
              transform="rotate(-90 50 50)"
              style={{ transition: "stroke-dashoffset .25s linear" }}
            />
          </svg>

          {/* E38 — a mote orbiting the ring, driven by scroll not by time */}
          <div
            className="absolute inset-0"
            style={{ transform: `rotate(${t * 360 - 90}deg)`, transition: "transform .25s linear" }}
          >
            <span
              className="absolute h-2 w-2 rounded-full bg-cyan shadow-[0_0_10px_2px_rgba(6,182,212,.6)]"
              style={{ left: `${50 + R}%`, top: "50%", transform: "translate(-50%,-50%)" }}
            />
          </div>

          {/* centre */}
          <div className="fx-beat absolute left-1/2 top-1/2 w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 text-center">
            <p className="label text-faint">Mission</p>
            <p className="font-display mt-1.5 text-[20px] leading-none text-ink">
              {String(Math.round(t * 100)).padStart(2, "0")}
              <span className="text-[13px] text-faint">%</span>
            </p>
            <p className="mt-1.5 font-data text-[10px] text-cyan-dark">
              {STEPS[active].name.toLowerCase()}
            </p>
          </div>

          {/* nodes */}
          {STEPS.map(({ Icon, name }, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <div
                key={name}
                style={vars({ left: `${NODES[i].x}%`, top: `${NODES[i].y}%` })}
                className="absolute -translate-x-1/2 -translate-y-1/2"
              >
                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className={`grid h-11 w-11 place-items-center rounded-full border bg-white transition-all duration-500 ${
                      on
                        ? "scale-[1.15] border-cyan text-cyan-dark shadow-[0_0_0_5px_rgba(6,182,212,.12)]"
                        : done
                          ? "border-pass/40 text-pass"
                          : "border-line text-faint"
                    }`}
                  >
                    <Icon className="h-[17px] w-[17px]" />
                  </span>
                  <span
                    className={`text-[11.5px] font-medium transition-colors duration-500 ${
                      on ? "text-ink" : "text-muted"
                    }`}
                  >
                    {name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
