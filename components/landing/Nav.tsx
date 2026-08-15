"use client";

import { useState } from "react";
import { Logo, ChevronDown, Globe } from "./Icons";
import VersionSwitch from "../VersionSwitch";

const LINKS = ["Product", "Solutions", "Resources"] as const;

export default function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-6">
        <a href="#" aria-label="OPTIMUS home">
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.map((l) => (
            <li key={l}>
              <button className="flex items-center gap-1 rounded-md px-3 py-2 text-[14px] text-body transition hover:text-ink">
                {l}
                <ChevronDown className="h-3.5 w-3.5 text-faint" />
              </button>
            </li>
          ))}
          <li>
            <a
              href="#pricing"
              className="rounded-md px-3 py-2 text-[14px] text-body transition hover:text-ink"
            >
              Pricing
            </a>
          </li>
          <li>
            <a
              href="#enterprise"
              className="rounded-md px-3 py-2 text-[14px] text-body transition hover:text-ink"
            >
              Enterprise
            </a>
          </li>
        </ul>

        <div className="ml-auto flex items-center gap-2">
          <button className="hidden items-center gap-1.5 rounded-md px-2.5 py-2 text-[13px] text-body transition hover:text-ink md:flex">
            <Globe className="h-4 w-4" />
            EN
            <ChevronDown className="h-3 w-3 text-faint" />
          </button>

          <a
            href="#signin"
            className="hidden rounded-lg border border-line-2 px-4 py-2 text-[14px] font-medium text-ink transition hover:border-ink/30 hover:bg-mist sm:block"
          >
            Sign in
          </a>

          <a
            href="#start"
            className="rounded-lg bg-ink px-4 py-2 text-[14px] font-medium text-white transition hover:bg-ink/88"
          >
            Get started free
          </a>

          {/* top-right corner — jump to the animated landing page */}
          <VersionSwitch to="v2" />

          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
            className="ml-1 grid h-9 w-9 place-items-center rounded-md border border-line lg:hidden"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="block h-[1.5px] w-4 bg-ink" />
              <span className="block h-[1.5px] w-4 bg-ink" />
              <span className="block h-[1.5px] w-4 bg-ink" />
            </span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-line bg-white lg:hidden">
          <ul className="mx-auto flex max-w-[1200px] flex-col px-6 py-3">
            {[...LINKS, "Pricing", "Enterprise", "Sign in"].map((l) => (
              <li key={l}>
                <a
                  href="#"
                  className="block py-2.5 text-[15px] text-body transition hover:text-ink"
                >
                  {l}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
