"use client";

/**
 * Where a person lands. Answers three questions and nothing else:
 * what can OPTIMUS do, what has it done, what do I do next.
 *
 * Every number is read from a live endpoint. Nothing here is illustrative.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/workspace/AppShell";
import { MessageSquare, ClipboardList, BookOpen, ArrowRight } from "lucide-react";
import "./home.css";

export function HomeView() {
  const [lib, setLib] = useState<{ shelves?: { wired: number; onDisk: number; toDownload: number } } | null>(null);
  const [missions, setMissions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/library").then((r) => r.json()).then((b) => b.ok && setLib(b)).catch(() => {});
    fetch("/api/graph/missions").then((r) => r.json()).then((b) => b.ok && setMissions(b.missions ?? [])).catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="home-wrap">
        <header className="home-head">
          <h1>What do you want done?</h1>
          <p>
            OPTIMUS plans the work, does it, and proves each step before moving on.
            You see every decision and the evidence behind it.
          </p>
        </header>

        <div className="home-actions">
          <Link href="/chat" className="home-action">
            <MessageSquare size={20} />
            <b>Talk it through</b>
            <span>Describe what you need in your own words</span>
            <ArrowRight size={14} className="home-arrow" />
          </Link>
          <Link href="/plan" className="home-action is-primary">
            <ClipboardList size={20} />
            <b>Make a plan</b>
            <span>Get a step-by-step proposal to read before anything runs</span>
            <ArrowRight size={14} className="home-arrow" />
          </Link>
          <Link href="/library" className="home-action">
            <BookOpen size={20} />
            <b>See what it can do</b>
            <span>{lib?.shelves ? `${lib.shelves.wired} skills ready to use` : "The skill library"}</span>
            <ArrowRight size={14} className="home-arrow" />
          </Link>
        </div>

        {lib?.shelves && (
          <section className="home-stats">
            <div><b>{lib.shelves.wired}</b><span>skills ready</span></div>
            <div><b>{lib.shelves.onDisk}</b><span>repositories on this machine</span></div>
            <div><b>{lib.shelves.toDownload}</b><span>still to fetch</span></div>
          </section>
        )}

        <section className="home-recent">
          <h2>Recent work</h2>
          {missions.length === 0 ? (
            <p className="home-muted">Nothing has run yet.</p>
          ) : (
            <ul>
              {missions.slice(0, 6).map((m) => (
                <li key={m}>
                  <Link href={`/missions/${encodeURIComponent(m)}`}>{m}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
