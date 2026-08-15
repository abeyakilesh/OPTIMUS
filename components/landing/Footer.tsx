import { Logo } from "./Icons";

const COLUMNS = [
  { title: "Product", links: ["Workspaces", "The loop", "Engine", "Proof", "Changelog"] },
  { title: "Build", links: ["Architecture", "Capability manifest", "Absorption log", "Roadmap"] },
  { title: "Resources", links: ["Docs", "Self-host guide", "Bring your own key", "Community"] },
  { title: "Legal", links: ["Privacy", "Terms", "Security", "Licenses"] },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-white">
      <div className="mx-auto max-w-[1180px] px-6 pt-16">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_repeat(4,minmax(0,1fr))]">
          <div>
            <Logo />
            <p className="mt-3.5 max-w-[32ch] text-[13px] leading-relaxed text-muted">
              An AI-native work environment that plans, acts, verifies and
              remembers — with a kernel you can actually inspect.
            </p>
            <p className="mt-5 flex items-center gap-2 font-data text-[10.5px] text-faint">
              <span className="relative flex h-1.5 w-1.5 shrink-0">
                <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
              </span>
              kernel in development · nothing shipped unproven
            </p>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.title}>
              <h3 className="label text-ink">{c.title}</h3>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-[13px] text-muted transition hover:text-cyan-dark">
                      {l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="font-data text-[11px] text-faint">
            © {new Date().getFullYear()} OPTIMUS
          </p>
          <p className="font-data text-[11px] text-faint">English</p>
        </div>
      </div>

      {/*
        The wordmark. Oversized, with cyan plasma illuminating the letters from
        the baseline up — see `.wordmark` in app/globals.css. `select-none` +
        aria-hidden: it is texture, not text anyone needs to read or copy.

        It sits fully inside the page — no negative margin, no bleed off the
        bottom edge — with white space beneath so the glyphs never touch the
        viewport edge.
      */}
      {/* The scaleY grows the glyphs DOWNWARD out of their layout box, so the
          bottom padding has to reserve that overflow (~3vw) plus the 5px of
          white that keeps the letters off the viewport edge. */}
      <div className="mt-[42px] px-4 pb-[calc(3vw+5px)] sm:px-6">
        <p
          aria-hidden
          className="wordmark font-display pointer-events-none block select-none text-center text-[23vw] leading-[0.86] tracking-[-0.05em]"
        >
          OPTIMUS
        </p>
      </div>
    </footer>
  );
}
