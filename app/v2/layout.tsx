import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
// The effects library. Imported here, not from globals.css, so it only ships
// on /v2 — the v1 page stays as light as it was.
import "./v2.css";

/**
 * v2 gets its own typography. Three roles, deliberately paired:
 *   display — Bricolage Grotesque: a variable grotesque with real optical
 *             sizing, so the huge hero type has tension the system stack
 *             can't produce.
 *   body    — Instrument Sans: slightly condensed, high x-height, stays
 *             readable at 15px where the display face would not.
 *   data    — JetBrains Mono: timestamps, counters, log output.
 * next/font self-hosts these at build time — no runtime CDN request.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OPTIMUS — State the objective. Watch it get done.",
  description:
    "OPTIMUS plans, acts, verifies and remembers. Browser, code, research, data, design and automation in one workspace — every result backed by proof.",
};

export default function V2Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${display.variable} ${body.variable} ${mono.variable} v2-root`}>
      {children}
    </div>
  );
}
