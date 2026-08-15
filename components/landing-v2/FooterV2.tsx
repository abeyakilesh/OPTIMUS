import { Logo } from "../landing/Icons";
import { Reveal } from "./fx";

const COLUMNS = [
  { title: "Product", links: ["Workspaces", "The loop", "Engine", "Proof", "Changelog"] },
  { title: "Build", links: ["Architecture", "Capability manifest", "Absorption log", "Roadmap"] },
  { title: "Resources", links: ["Docs", "Self-host guide", "Bring your own key", "Community"] },
  { title: "Legal", links: ["Privacy", "Terms", "Security", "Licenses"] },
];

export default function FooterV2() {
  return (
    <footer className="relative overflow-hidden bg-white">
      <div className="mx-auto max-w-[1180px] px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <Reveal variant="up">
            <div>
              <Logo />
              <p className="mt-3.5 max-w-[32ch] text-[13px] leading-relaxed text-muted">
                An AI-native work environment that plans, acts, verifies and
                remembers — with a kernel you can actually inspect.
              </p>
              <p className="mt-5 flex items-center gap-2 font-data text-[10.5px] text-faint">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
                </span>
                kernel in development · nothing shipped unproven
              </p>
            </div>
          </Reveal>

          {COLUMNS.map((c, i) => (
            <Reveal key={c.title} variant="up" delay={80 + i * 60}>
              <div>
                <h3 className="label text-ink">{c.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="fx-ulink text-[13px] text-muted transition hover:text-ink">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="font-data text-[11px] text-faint">
            © {new Date().getFullYear()} OPTIMUS
          </p>
          <p className="font-data text-[11px] text-faint">
            Landing page 2.0 · English
          </p>
        </div>
      </div>

      {/* oversized wordmark, clipped by the viewport edge */}
      <p
        aria-hidden
        className="font-display pointer-events-none select-none text-center text-[19vw] leading-[0.75] tracking-[-0.05em] text-ink/[0.035]"
      >
        OPTIMUS
      </p>
    </footer>
  );
}
