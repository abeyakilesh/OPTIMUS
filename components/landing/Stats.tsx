import { CountUp } from "./motion";

/**
 * Every figure is countable from the repo inventory
 * (see ../OPTIMUS_CAPABILITY_ARCHITECTURE.md). Do NOT add uptime, accuracy,
 * or "trusted by N teams" numbers — none of those are measured yet.
 */
const STATS = [
  { to: 5000, suffix: "+", label: "Capabilities catalogued", sub: "skills · tools · APIs" },
  { to: 350, suffix: "+", label: "Distinct capability types", sub: "across 12 domains" },
  { to: 42, suffix: "", label: "MCP-native systems", sub: "one protocol, no glue" },
  { to: 17, suffix: "", label: "Workspace surfaces", sub: "one shared kernel" },
];

export default function Stats() {
  return (
    <section className="border-b border-line bg-ink">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <p className="label text-center text-white/45">What is actually under the hood</p>

        <dl className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <span className="block h-px w-full bg-cyan" />
              <dt className="font-display mt-5 text-[clamp(2.4rem,4.4vw,3.1rem)] leading-none text-white tabular-nums">
                <CountUp to={s.to} suffix={s.suffix} duration={1700} />
              </dt>
              <dd className="mt-3">
                <span className="block text-[13.5px] font-medium text-white/90">{s.label}</span>
                <span className="mt-1 block font-data text-[11px] text-white/40">{s.sub}</span>
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-12 text-center font-data text-[11px] text-white/35">
          Counted from 107 analysed repositories · 62 on the absorption list ·
          nothing is marked available until its proof gate is green
        </p>
      </div>
    </section>
  );
}
