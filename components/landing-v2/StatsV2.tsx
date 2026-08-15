import { CountUp, Reveal, InViewGroup } from "./fx";
import { vars } from "./style";

/**
 * Derived from OPTIMUS_CAPABILITY_ARCHITECTURE.md. Every figure here is
 * countable from the repo inventory. Do NOT add uptime, accuracy or
 * "trusted by N teams" numbers — none of those are measured yet.
 */
const STATS = [
  { to: 5000, suffix: "+", label: "Capabilities catalogued", sub: "skills · tools · APIs" },
  { to: 350, suffix: "+", label: "Distinct capability types", sub: "across 12 domains" },
  { to: 42, suffix: "", label: "MCP-native systems", sub: "one protocol, no glue" },
  { to: 17, suffix: "", label: "Workspace surfaces", sub: "one shared kernel" },
];

export default function StatsV2() {
  return (
    <section className="border-b border-line bg-ink">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <Reveal variant="up">
          <p className="label text-center text-white/45">
            What is actually under the hood
          </p>
        </Reveal>

        <InViewGroup>
          <dl className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <Reveal key={s.label} variant="up" delay={i * 110}>
                <div className="group relative">
                  {/* E36 — the rule above each stat draws itself in */}
                  <svg viewBox="0 0 100 1" preserveAspectRatio="none" className="h-px w-full">
                    <line
                      x1="0" y1="0.5" x2="100" y2="0.5"
                      stroke="var(--color-cyan)"
                      strokeWidth="1"
                      className="fx-draw"
                      style={vars({ "--fx-len": "100", "--fx-d": `${i * 140}ms` })}
                    />
                  </svg>

                  <dt className="font-display mt-5 text-[clamp(2.4rem,4.4vw,3.1rem)] leading-none text-white tabular-nums">
                    {/* E54 — counts up when it enters view */}
                    <CountUp to={s.to} suffix={s.suffix} duration={1700} />
                  </dt>
                  <dd className="mt-3">
                    <span className="block text-[13.5px] font-medium text-white/90">
                      {s.label}
                    </span>
                    <span className="mt-1 block font-data text-[11px] text-white/40">
                      {s.sub}
                    </span>
                  </dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </InViewGroup>

        <Reveal variant="up" delay={500}>
          <p className="mt-12 text-center font-data text-[11px] text-white/35">
            Counted from 107 analysed repositories · 62 on the absorption list ·
            nothing is marked available until its proof gate is green
          </p>
        </Reveal>
      </div>
    </section>
  );
}
