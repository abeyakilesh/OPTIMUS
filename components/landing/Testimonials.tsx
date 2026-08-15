/**
 * ⚠️  Real quotes only.
 *
 * This array is intentionally EMPTY. Do not ship invented testimonials —
 * fabricated social proof is both misleading and a legal risk. Add entries
 * here only once you have written permission from a real user.
 *
 *   { quote: "...", name: "...", role: "...", company: "..." }
 */
type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
};

const TESTIMONIALS: Testimonial[] = [];

const PLACEHOLDER_SLOTS = 3;

export default function Testimonials() {
  const hasReal = TESTIMONIALS.length > 0;

  return (
    <section className="border-b border-line bg-mist">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <h2 className="text-center text-[30px] font-semibold tracking-[-0.02em] text-ink sm:text-[34px]">
          {hasReal ? "Loved by people who get things done" : "Early access is open"}
        </h2>
        <p className="mx-auto mt-3 max-w-[54ch] text-center text-[15.5px] text-body">
          {hasReal
            ? "Teams shipping real work with OPTIMUS."
            : "OPTIMUS is being built in the open. Try it, and your story could go here."}
        </p>

        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {hasReal
            ? TESTIMONIALS.map((t) => (
                <figure
                  key={t.name}
                  className="rounded-xl border border-line bg-white p-5"
                >
                  <blockquote className="text-[14px] leading-relaxed text-body">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                    <span className="h-8 w-8 rounded-full bg-sky-2" />
                    <span>
                      <span className="block text-[13px] font-medium text-ink">
                        {t.name}
                      </span>
                      <span className="block text-[12px] text-faint">
                        {t.role}, {t.company}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))
            : Array.from({ length: PLACEHOLDER_SLOTS }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-dashed border-line-2 bg-white/60 p-5"
                >
                  <p className="text-[13.5px] leading-relaxed text-faint">
                    Space reserved for a real customer quote — added only with
                    their permission.
                  </p>
                  <div className="mt-4 flex items-center gap-3 border-t border-dashed border-line pt-4">
                    <span className="h-8 w-8 rounded-full border border-dashed border-line-2" />
                    <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
                      Awaiting first users
                    </span>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </section>
  );
}
