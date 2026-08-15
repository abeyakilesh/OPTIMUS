# OPTIMUS

The AI-native work environment. This is the real product repo.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4

## Run it

```bash
npm install     # first time only
npm run dev     # → http://localhost:3000
npm run build   # production build (also runs typecheck)
npm run lint
```

## Two landing pages

There are currently **two** landing pages behind a switch, so the direction can
be picked by looking rather than arguing. A small pill in the **top-right of the
nav** flips between them. Delete the loser (and `components/VersionSwitch.tsx`)
once the call is made.

| Route | What it is |
|---|---|
| `/` | **v1** — calm, static, hairline-and-whitespace. System font stack. |
| `/v2` | **v2** — the animated one. 60 catalogued effects, three real typefaces. |

## Structure

```
app/
  layout.tsx          root layout + metadata
  page.tsx            v1 landing page
  globals.css         design tokens (the whole palette lives here)
  v2/
    layout.tsx        v2 fonts + metadata, imports v2.css
    page.tsx          v2 landing page
    v2.css            ← the effects library (E01–E52)
components/
  VersionSwitch.tsx   the v1 ⇄ v2 pill
  landing/            v1 sections
    Icons.tsx         all inline SVG icons + brand mark (shared with v2)
    Nav.tsx  Hero.tsx  Features.tsx  Loop.tsx  Stats.tsx
    Platforms.tsx  Testimonials.tsx  CTA.tsx  Footer.tsx
  landing-v2/         v2 sections
    fx.tsx            motion primitives (E53–E60) — "use client"
    style.ts          `vars()` helper — deliberately NOT a client module
    NavV2.tsx         condenses on scroll
    HeroV2.tsx        aurora, motes, word reveal, live console
    MarqueeV2.tsx     counter-scrolling engine ticker
    KernelV2.tsx      the K1–K5 spine with data flowing through it
    FeaturesV2.tsx    bento grid, spotlight cards
    LoopV2.tsx        scroll-linked ring
    StatsV2.tsx       count-up figures on dark ground
    EvidenceV2.tsx    tabbed proof panel + accordion
    PlatformsV2.tsx  TestimonialsV2.tsx  CTAV2.tsx  FooterV2.tsx
```

### Why `style.ts` exists

`fx.tsx` carries `"use client"`. A plain function exported from a client module
becomes a *client reference* and throws if a server component calls it during
render. `vars()` is used by both server and client sections, so it lives in its
own module. Don't move it back.

## The v2 effect inventory (60)

Every effect is numbered in source so this list stays auditable. E01–E52 are in
[`app/v2/v2.css`](app/v2/v2.css) (E29 and E50 sit in `globals.css` because the
switch pill uses them on v1 too); E53–E60 are in
[`components/landing-v2/fx.tsx`](components/landing-v2/fx.tsx).

| # | Effect | # | Effect |
|---|---|---|---|
| E01–E08 | reveal on scroll: up, down, left, right, scale, blur, rotate, clip | E31–E33 | pipe dots: horizontal, vertical, shared bus |
| E09 | masked word-by-word headline roll-up | E34 | typing dots |
| E10 | drifting aurora blobs | E35 | equalizer bars |
| E11 | rotating conic sheen | E36 | SVG stroke draw-in |
| E12 | radially-masked hairline grid | E37 | dashed current around a ring |
| E13 | fine grain overlay | E38 | orbiting node |
| E14 | scan line down the console | E39 | weightless float |
| E15 | gradient shine across a headline | E40 | progress bar fill on view |
| E16 | blinking terminal caret | E41 | log line arrival |
| E17 | underline drawn on hover | E42 | scroll progress bar |
| E18 | infinite marquee, pauses on hover | E43 | cursor spotlight |
| E19 | 3D tilt | E44 | nav condenses on scroll |
| E20 | cursor spotlight inside a card | E45 | mobile menu slide |
| E21 | border lit under the cursor | E46 | sticky-stacking column |
| E22 | lift + cyan underglow | E47 | tooltip |
| E23 | sheen sweep across a button | E48 | accordion (grid-rows) |
| E24 | click ripple | E49 | sliding tab indicator |
| E25 | icon micro-bounce | E50 | arrow nudge |
| E26 | rotating conic ring on the live card | E51 | marching dashed placeholder |
| E27 | cyan heartbeat — "kernel running" | E52 | counter digit roll |
| E28 | amber heartbeat — "step executing" | E53–E60 | typewriter · count-up · scramble · magnetic button · canvas motes · live log stream · scroll-linked section progress · parallax |
| E29 | radar ping | | |
| E30 | skeleton shimmer | | |

**Harvested from `nexus/apps/web/app/globals.css`** (fate: HARVEST — pattern, not
code): the heartbeat vocabulary (E27, E28), pipe-dot flow (E31–E33), shimmer
(E30), typing dots (E34), ambient drift (E10) and message-in (E41). The nexus
originals encode *state* in animation — pulse speed = urgency — which is why
they're worth keeping. Recoloured to the OPTIMUS palette.

### Motion is never load-bearing

`globals.css` zeroes every animation and transition under
`prefers-reduced-motion: reduce`. The JS primitives check the query too, via
`useReducedMotion()` (a `useSyncExternalStore` subscription, so it stays correct
if the OS setting flips mid-session). With all motion off the page still reads
correctly — the loop diagram parks mid-way, counters jump to their final value,
the typewriter shows its first phrase in full.

## Design tokens

The entire palette is defined once in `app/globals.css` under `@theme`.
**White · cyan blue · light blue · black (minimal, outlines/text) · grey.**
Use the token names (`text-ink`, `border-line`, `bg-sky`, `text-cyan-dark`)
rather than raw hex so the palette stays consistent.

| Token | Use |
|---|---|
| `white` / `mist` / `sky` / `sky-2` | surfaces, light-blue washes |
| `cyan` / `cyan-dark` / `cyan-soft` | the single accent |
| `ink` | near-black: headings, primary buttons |
| `body` / `muted` / `faint` | grey text, three levels |
| `line` / `line-2` | hairline borders |

### The two extra hues

v2 adds exactly two colours beyond the palette, and they are **semantic, not
decorative** — they encode mission state and nothing else:

| Token | Hue | Means, and only means |
|---|---|---|
| `run` / `run-soft` | amber `#f59e0b` | a step is executing right now |
| `pass` / `pass-soft` | emerald `#10b981` | verified — a proof passed |

Never use them for backgrounds, headings, buttons or "visual interest". If a
new element needs colour and isn't reporting run-state or proof-state, it gets
cyan or grey. This is the rule that keeps the page from drifting into a
six-colour dashboard.

## Typography

v1 uses the system stack. v2 loads three faces via `next/font` (self-hosted at
build time — no runtime CDN request), scoped to `.v2-root` so v1 is untouched:

| Role | Face | Why |
|---|---|---|
| display | Bricolage Grotesque | variable, real optical sizing — gives the huge hero type tension the system stack can't |
| body | Instrument Sans | slightly condensed, high x-height, still readable at 15px |
| data | JetBrains Mono | timestamps, counters, log output, capability IDs |

## Honesty rules for this page

These are not style preferences. Breaking them ships a lie to customers.

- **No invented testimonials.** `Testimonials.tsx` and `TestimonialsV2.tsx` both
  render a deliberate empty state. Add to the `TESTIMONIALS` array **only** with
  written permission from a real user.
- **No unmeasured numbers.** Stats come from the capability analysis
  (`../OPTIMUS_CAPABILITY_ARCHITECTURE.md`) and are countable from the repo
  inventory. No uptime, accuracy, or "trusted by N teams" figures until they're
  actually measured.
- **The engine ticker says "assembled from", not "integrated with".** The names
  in `MarqueeV2.tsx` are real repositories on the absorption list, and absorption
  is still in progress. Don't reword it into a claim that they're all live —
  that's Prime Directive #4 in the root `CLAUDE.md`.
- **Copy describes the design, not a shipped product.** The hero eyebrow says
  "Kernel build in progress" on purpose. Review the CTA and platform copy before
  any public launch, since some of it describes intended behaviour.
- Next.js auto-generates `AGENTS.md` / `CLAUDE.md` here with framework
  guidance. The **build bible** for the whole OPTIMUS effort is the
  `CLAUDE.md` at the workspace root, one level up.
