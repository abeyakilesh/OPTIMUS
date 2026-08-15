import { Reveal, Magnetic, Ripple, Motes, Words } from "./fx";
import { ArrowRight, Check } from "../landing/Icons";

const POINTS = ["No credit card", "Your own model key", "Delete everything in one click"];

export default function CTAV2() {
  return (
    <section id="start" className="fx-noise relative overflow-hidden bg-ink">
      {/* ambient — the only place the dark ground gets colour */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="fx-conic-bg absolute left-1/2 top-1/2 h-[820px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.13] blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_100%,rgba(6,182,212,.22),transparent_70%)]" />
        <Motes className="absolute inset-0 h-full w-full opacity-60" count={26} />
      </div>

      <div className="relative mx-auto max-w-[1180px] px-6 py-28 text-center">
        <Reveal variant="down">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
            </span>
            <span className="label text-white/60">Early access</span>
          </span>
        </Reveal>

        <h2 className="font-display mx-auto mt-7 max-w-[16ch] text-balance text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.03] text-white">
          <Words text="Stop prompting." step={62} />
          <br />
          <span className="text-cyan">
            <Words text="Start finishing." start={260} step={62} />
          </span>
        </h2>

        <Reveal variant="up" delay={520}>
          <p className="mx-auto mt-6 max-w-[50ch] text-[16px] leading-relaxed text-white/60">
            Give OPTIMUS one objective and watch it come back with the work
            done — and the proof that it&rsquo;s done.
          </p>
        </Reveal>

        <Reveal variant="up" delay={620}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Magnetic strength={0.24}>
              <Ripple
                href="#signup"
                className="fx-sheen group inline-flex items-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-ink transition hover:bg-white/92"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start free
                  <ArrowRight className="fx-nudge h-4 w-4" />
                </span>
              </Ripple>
            </Magnetic>
            <Magnetic strength={0.16}>
              <a
                href="#docs"
                className="group inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-4 text-[15px] font-medium text-white/85 transition hover:border-white/45 hover:text-white"
              >
                Read the architecture
                <ArrowRight className="fx-nudge h-4 w-4" />
              </a>
            </Magnetic>
          </div>
        </Reveal>

        <Reveal variant="up" delay={720}>
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-1.5 text-[13px] text-white/45">
                <Check className="h-3.5 w-3.5 text-cyan" />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
