import { Globe, MonitorIcon, Check, ArrowRight } from "./Icons";

const PLATFORMS = [
  {
    Icon: Globe,
    name: "Web",
    tag: "Open in a browser",
    points: [
      "Nothing to install — start a mission in seconds",
      "Missions keep running when you close the tab",
      "Share a result as a link, with its proof attached",
    ],
    cta: "Open the web app",
  },
  {
    Icon: MonitorIcon,
    name: "Desktop",
    tag: "Mac · Windows · Linux",
    points: [
      "Runs the kernel locally — your files never leave the machine",
      "Bring your own model key, no per-seat markup",
      "Full sandbox and rollback on your own hardware",
    ],
    cta: "Download for desktop",
  },
];

export default function Platforms() {
  return (
    <section className="relative overflow-hidden border-b border-line bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <p className="label text-center text-cyan-dark">Anywhere you work</p>
        <h2 className="font-display mx-auto mt-3 max-w-[18ch] text-balance text-center text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.08] text-ink">
          One workspace. Your machine or ours.
        </h2>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {PLATFORMS.map(({ Icon, name, tag, points, cta }) => (
            <div
              key={name}
              className="card-lift group flex h-full flex-col rounded-2xl border border-line bg-white p-7"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-sky text-cyan-dark transition group-hover:border-cyan/45">
                  <Icon className="fx-lift-icon h-[18px] w-[18px]" />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold leading-tight text-ink">{name}</h3>
                  <p className="font-data text-[10.5px] text-faint">{tag}</p>
                </div>
              </div>

              <ul className="mt-6 space-y-2.5">
                {points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-body"
                  >
                    <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-pass" />
                    {p}
                  </li>
                ))}
              </ul>

              <a
                href="#start"
                className="mt-auto flex items-center gap-1.5 pt-7 text-[13.5px] font-medium text-ink"
              >
                {cta}
                <ArrowRight className="fx-nudge h-3.5 w-3.5 text-cyan-dark" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
