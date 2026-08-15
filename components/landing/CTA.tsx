import { ArrowRight, Check } from "./Icons";

const POINTS = ["No credit card", "Your own model key", "Delete everything in one click"];

export default function CTA() {
  return (
    <section id="start" className="relative overflow-hidden bg-ink">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {/* Cyan light welling up from the floor of the section.
            The two side pools are mirrored at 12% / 88% — a single off-centre
            pool made the whole band look lit from the left. */}
        <div className="absolute inset-0 bg-[radial-gradient(78%_62%_at_50%_118%,rgba(6,182,212,.34),transparent_72%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(36%_44%_at_12%_110%,rgba(6,182,212,.17),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(36%_44%_at_88%_110%,rgba(6,182,212,.17),transparent_70%)]" />
        {/* sparse specks */}
        <div className="absolute inset-0 opacity-[0.5] bg-[radial-gradient(1px_1px_at_20%_30%,rgba(103,232,249,.7),transparent),radial-gradient(1px_1px_at_70%_18%,rgba(103,232,249,.5),transparent),radial-gradient(1px_1px_at_45%_72%,rgba(103,232,249,.55),transparent),radial-gradient(1px_1px_at_85%_58%,rgba(103,232,249,.45),transparent),radial-gradient(1px_1px_at_12%_78%,rgba(103,232,249,.5),transparent)]" />
      </div>

      <div className="relative mx-auto max-w-[1180px] px-6 py-24 text-center">
        <h2 className="font-display mx-auto max-w-[16ch] text-balance text-[clamp(2.1rem,5vw,3.4rem)] leading-[1.03] text-white">
          Stop prompting.
          <br />
          <span className="text-cyan">Start finishing.</span>
        </h2>

        <p className="mx-auto mt-6 max-w-[46ch] text-[15.5px] leading-relaxed text-white/60">
          Give OPTIMUS one objective and watch it come back with the work done —
          and the proof that it&rsquo;s done.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#signup"
            className="group inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan to-cyan-dark px-7 py-3.5 text-[15px] font-semibold text-white transition hover:brightness-110"
          >
            Start free
            <ArrowRight className="fx-nudge h-4 w-4" />
          </a>
          <a
            href="#docs"
            className="group inline-flex items-center gap-2 rounded-lg border border-white/22 px-6 py-3.5 text-[15px] font-medium text-white/88 transition hover:border-white/45 hover:text-white"
          >
            Read the architecture
            <ArrowRight className="fx-nudge h-4 w-4" />
          </a>
        </div>

        <ul className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-2">
          {POINTS.map((p) => (
            <li key={p} className="flex items-center gap-1.5 text-[13px] text-white/50">
              <Check className="h-3.5 w-3.5 text-cyan" />
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
