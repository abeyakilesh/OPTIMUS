"use client";

/**
 * THE APP'S SPINE. One persistent navigation for the whole product.
 *
 * Before this, OPTIMUS was a set of pages that did not know about each other:
 * a marketing site, a chat with no way to the canvas, a canvas with no way
 * back, and a library nothing linked to. There was no flow, so there was no
 * product — just screens.
 *
 * The order below IS the flow, and it is deliberate:
 *
 *   Home → Chat → Plan → Build → Results
 *   ask       talk    propose  watch   keep
 *
 * ⚠️ Anything not built says so, and does not navigate. A sidebar entry that
 * opens an empty page is the Atlas failure in its smallest form — the nav
 * promises a feature and the page reveals there is none.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, MessageSquare, ClipboardList, Play, CheckCircle2,
  BookOpen, Bot, Boxes, Settings, PanelLeftClose, PanelLeft,
} from "lucide-react";
import { useState } from "react";

interface Item {
  label: string;
  href: string;
  Icon: typeof Home;
  live: boolean;
  /** Why it is not available, shown on hover. Never a bare grey label. */
  why?: string;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Work",
    items: [
      { label: "Home", href: "/home", Icon: Home, live: true },
      { label: "Chat", href: "/chat", Icon: MessageSquare, live: true },
      { label: "Plan", href: "/plan", Icon: ClipboardList, live: true },
      { label: "Build", href: "/missions/latest", Icon: Play, live: true },
      { label: "Results", href: "/results", Icon: CheckCircle2, live: true },
    ],
  },
  {
    title: "Knowledge",
    items: [
      { label: "Library", href: "/library", Icon: BookOpen, live: true },
      { label: "Agents", href: "#", Icon: Bot, live: false, why: "No agent registry yet — every step runs as the kernel" },
      { label: "Models", href: "/settings/providers", Icon: Boxes, live: true },
    ],
  },
  {
    title: "System",
    items: [{ label: "Settings", href: "/settings/providers", Icon: Settings, live: true }],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) =>
    href !== "#" && (pathname === href || (href !== "/home" && pathname.startsWith(href.split("/")[1] ? `/${href.split("/")[1]}` : href)));

  return (
    <aside className={`app-side ${collapsed ? "is-collapsed" : ""}`}>
      <div className="app-side-top">
        <Link href="/home" className="app-brand">
          <span className="app-brand-mark">O</span>
          {!collapsed && <span className="app-brand-name">OPTIMUS</span>}
        </Link>
        <button
          className="app-side-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      <nav className="app-side-nav">
        {GROUPS.map((g) => (
          <div key={g.title} className="app-side-group">
            {!collapsed && <p className="app-side-title">{g.title}</p>}
            {g.items.map(({ label, href, Icon, live, why }) =>
              live ? (
                <Link
                  key={label}
                  href={href}
                  className={`app-side-item ${isActive(href) ? "is-active" : ""}`}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  {!collapsed && <span>{label}</span>}
                </Link>
              ) : (
                <span
                  key={label}
                  className="app-side-item is-soon"
                  title={why ?? "Not built yet"}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  {!collapsed && (
                    <>
                      <span>{label}</span>
                      <em>soon</em>
                    </>
                  )}
                </span>
              ),
            )}
          </div>
        ))}
      </nav>

      <div className="app-side-foot">
        <div className="app-avatar">A</div>
        {!collapsed && <span className="app-side-user">Abey</span>}
      </div>
    </aside>
  );
}
