import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * TWO faces for the whole page — no more.
 *
 *   sans — Bricolage Grotesque, used for everything from the 3.4rem hero
 *          down to 10px captions. It's a variable grotesque with optical
 *          sizing, so one family covers display and text without the
 *          mismatch you get from pairing two different sans faces.
 *   data — JetBrains Mono, and ONLY for machine output: counters, timestamps,
 *          capability IDs, uppercase micro-labels.
 *
 * next/font self-hosts both at build time — no runtime CDN request.
 */
const sans = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-sans-brand",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OPTIMUS — One objective. Everything it takes to get it done.",
  description:
    "OPTIMUS is the AI-native work environment that plans, acts, verifies and remembers. Code, browser, data, design and automation — unified in one intelligent workspace.",
  openGraph: {
    title: "OPTIMUS",
    description:
      "The AI-native work environment that plans, acts, verifies and remembers.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
