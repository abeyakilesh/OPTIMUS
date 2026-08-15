"use client";

import { useEffect, useState } from "react";
import { Logo, ChevronDown } from "../landing/Icons";
import VersionSwitch from "../VersionSwitch";

const LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how" },
  { label: "Engine", href: "#engine" },
  { label: "Proof", href: "#proof" },
] as const;

export default function NavV2() {
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);

  // E44 — the bar condenses and gains a hairline once you leave the hero.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fx-nav sticky top-0 z-[60] ${
        stuck
          ? "border-b border-line bg-white/80 shadow-[0_1px_20px_-12px_rgba(11,13,14,.35)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav
        className={`mx-auto flex max-w-[1180px] items-center gap-7 px-6 ${
          stuck ? "h-14" : "h-[72px]"
        } fx-nav`}
      >
        <a href="#top" aria-label="OPTIMUS home">
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l.label}>
              <a
                href={l.href}
                className="fx-ulink rounded-md px-2.5 py-2 text-[13.5px] text-body transition hover:text-ink"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-2.5">
          <a
            href="#signin"
            className="hidden text-[13.5px] font-medium text-body transition hover:text-ink sm:block"
          >
            Sign in
          </a>

          <a
            href="#start"
            className="fx-sheen group rounded-full bg-ink px-4 py-2 text-[13.5px] font-medium text-white transition hover:bg-ink/90"
          >
            <span className="relative z-10 flex items-center gap-1.5">
              Start free
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="fx-nudge h-3.5 w-3.5"
              >
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </span>
          </a>

          {/* top-right corner — back to the original landing page */}
          <VersionSwitch to="v1" />

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="grid h-8 w-8 place-items-center rounded-md border border-line lg:hidden"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </nav>

      {open && (
        <div className="fx-menu border-t border-line bg-white/95 backdrop-blur-xl lg:hidden">
          <ul className="mx-auto flex max-w-[1180px] flex-col px-6 py-2">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block py-2.5 text-[15px] text-body transition hover:text-ink"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
