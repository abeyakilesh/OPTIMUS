import { Reveal } from "./fx";
import { vars } from "./style";

/**
 * The engines OPTIMUS is assembled from. These are real repositories on the
 * absorption list (see OPTIMUS_REPO_INVENTORY.md) — the copy says "assembled
 * from", not "integrated with", because absorption is still in progress.
 * Do not reword this into a claim that they are all live.
 */
const ROW_A = [
  "browser-use", "Scrapling", "firecrawl", "n8n", "Stirling-PDF", "OmniRoute",
  "OpenHands", "GitNexus", "supabase", "harbor", "camoufox", "anydoc",
];
const ROW_B = [
  "codesandbox", "langflow", "ast-grep", "FinceptTerminal", "hyperframes",
  "TimesFM", "open-design", "pinchtab", "coolify", "strix", "xmcp", "Agent-Reach",
];

function Row({ items, reverse, speed }: { items: string[]; reverse?: boolean; speed: string }) {
  return (
    <div className="fx-marquee overflow-hidden py-1.5">
      <div
        className={`fx-marquee-track ${reverse ? "fx-rev" : ""}`}
        style={vars({ "--fx-speed": speed })}
      >
        {/* duplicated once — the keyframe translates exactly -50% for a seamless loop */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
            {items.map((name) => (
              <span
                key={`${copy}-${name}`}
                className="group mx-1.5 flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-1.5 transition hover:border-cyan/45"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line-2 transition group-hover:bg-cyan" />
                <span className="whitespace-nowrap font-data text-[12px] text-body transition group-hover:text-ink">
                  {name}
                </span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MarqueeV2() {
  return (
    <section className="border-y border-line bg-mist/70 py-9">
      <Reveal variant="up">
        <p className="label mb-5 text-center text-faint">
          Assembled from proven open-source engines — not reimplemented
        </p>
      </Reveal>

      {/* E18 — two counter-scrolling ticker rows, both pause on hover */}
      <Row items={ROW_A} speed="46s" />
      <Row items={ROW_B} speed="58s" reverse />
    </section>
  );
}
