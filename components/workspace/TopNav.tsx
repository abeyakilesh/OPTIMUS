"use client";

/**
 * The product's top bar. Sections are the WORKSPACE's nouns — Canvas, Missions,
 * Agents, Models, Tools, Data, Library — not this mission's.
 *
 * ⚠️ HONESTY (ADR-0015). Only `Canvas` and `Missions` have anything behind them
 * today. The rest are marked `soon` and are visibly disabled rather than
 * navigating to an empty page that implies a feature exists. A nav item that
 * lies is the same defect as a green check on a capability that does nothing.
 */

import Link from "next/link";
import { Search, Bell, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";

const SECTIONS = [
  // Chat is FIRST because it is where a person starts — the canvas is where
  // work is watched, not where it is asked for.
  { label: "Chat", href: "/chat", live: true },
  { label: "Canvas", href: "/missions/latest", live: true },
  { label: "Missions", href: "/missions", live: true },
  { label: "Agents", href: "#", live: false },
  { label: "Models", href: "/settings/providers", live: true },
  { label: "Tools", href: "#", live: false },
  { label: "Data", href: "#", live: false },
  { label: "Library", href: "/library", live: true },
];

export function TopNav({ active = "Canvas" }: { active?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <nav className="ow-topnav">
      <Link href="/" className="ow-brand">
        <span className="ow-brand-mark">O</span>
        <span className="ow-brand-name">OPTIMUS</span>
        <span className="ow-beta">BETA</span>
      </Link>

      <div className="ow-sections">
        {SECTIONS.map((s) =>
          s.live ? (
            <Link
              key={s.label}
              href={s.href}
              className={`ow-section ${active === s.label ? "is-active" : ""}`}
            >
              {s.label}
            </Link>
          ) : (
            <span key={s.label} className="ow-section is-soon" title="Not built yet">
              {s.label}
            </span>
          ),
        )}
      </div>

      <div className="ow-topnav-right">
        <div className="ow-search">
          <Search size={14} />
          <input placeholder="Search nodes, agents, files, or ask OPTIMUS…" disabled />
          <kbd>⌘K</kbd>
        </div>
        <button className="ow-icon-btn" onClick={() => setDark((d) => !d)} aria-label="Toggle theme">
          {dark ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button className="ow-icon-btn" aria-label="Notifications" disabled>
          <Bell size={16} />
        </button>
        <div className="ow-avatar" title="Abey">A</div>
      </div>
    </nav>
  );
}
