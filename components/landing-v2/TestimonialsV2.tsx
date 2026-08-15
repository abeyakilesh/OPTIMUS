import { Reveal } from "./fx";
import { vars } from "./style";

/**
 * ⚠️ DELIBERATELY EMPTY — same rule as the v1 page.
 *
 * Add an entry ONLY when a real person has given written permission to be
 * quoted. Inventing names, roles, companies or quotes is fabricated social
 * proof: it misleads customers and it is a real legal exposure. Until then
 * this section renders an honest "no users yet" state.
 */
type Testimonial = { quote: string; name: string; role: string };
const TESTIMONIALS: Testimonial[] = [];

export default function TestimonialsV2() {
  if (TESTIMONIALS.length > 0) {
    return (
      <section className="border-b border-line bg-mist">
        <div className="mx-auto max-w-[1180px] px-6 py-24">
          <ul className="grid gap-4 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <li key={t.name} className="rounded-2xl border border-line bg-white p-6">
                <p className="text-[14.5px] leading-relaxed text-body">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <p className="mt-5 text-[13px] font-semibold text-ink">{t.name}</p>
                <p className="font-data text-[11px] text-faint">{t.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  return (
    <section className="border-b border-line bg-mist">
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <Reveal variant="up">
          <p className="label text-center text-faint">Customer stories</p>
        </Reveal>
        <Reveal variant="up" delay={80}>
          <h2 className="font-display mx-auto mt-3 max-w-[20ch] text-balance text-center text-[clamp(1.5rem,2.8vw,2rem)] leading-[1.12] text-ink">
            No quotes here yet — and we&rsquo;re not inventing any.
          </h2>
        </Reveal>
        <Reveal variant="up" delay={140}>
          <p className="mx-auto mt-3 max-w-[52ch] text-center text-[14.5px] leading-relaxed text-muted">
            This space is reserved for real users, once there are real users.
            If you want to be one of the first, the door is open.
          </p>
        </Reveal>

        {/* E51 — marching dashed placeholders: visibly "awaiting", not broken */}
        <ul className="mx-auto mt-10 grid max-w-[900px] gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} variant="up" delay={i * 110}>
              <li className="fx-march flex h-[150px] flex-col justify-end rounded-2xl bg-white/50 p-5">
                <span
                  style={vars({ "--fx-d": `${i * 0.25}s` })}
                  className="fx-shimmer block h-1.5 w-2/3 rounded-full bg-line"
                />
                <span className="mt-2 block h-1.5 w-1/3 rounded-full bg-line" />
                <span className="mt-4 font-data text-[10px] uppercase tracking-[0.16em] text-faint">
                  slot {i + 1} · open
                </span>
              </li>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
