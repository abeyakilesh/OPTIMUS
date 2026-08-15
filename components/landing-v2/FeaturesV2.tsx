"use client";

import { Reveal, Spot } from "./fx";
import { vars } from "./style";
import {
  MissionIcon,
  BrowserIcon,
  CodeIcon,
  ResearchIcon,
  DataIcon,
  DesignIcon,
  WorkflowIcon,
  ArrowRight,
} from "../landing/Icons";

const FEATURES = [
  {
    Icon: MissionIcon,
    name: "Mission Control",
    copy: "State a goal in plain language. OPTIMUS drafts the plan, picks the workspaces, and shows you every step before it runs one.",
    span: "sm:col-span-2",
    feature: true,
  },
  {
    Icon: BrowserIcon,
    name: "Browser",
    copy: "Reads, clicks and extracts like a person — with selectors that survive a redesign.",
  },
  {
    Icon: CodeIcon,
    name: "Code",
    copy: "Understands the repo as a graph, edits in an isolated worktree, proves it with tests.",
  },
  {
    Icon: ResearchIcon,
    name: "Research",
    copy: "Collects across the open web and your documents, and cites every claim.",
  },
  {
    Icon: DataIcon,
    name: "Data",
    copy: "Cleans, joins, models and charts — the artifact, not just the answer.",
  },
  {
    Icon: DesignIcon,
    name: "Design",
    copy: "Generates and edits real design files, not screenshots of design files.",
  },
  {
    Icon: WorkflowIcon,
    name: "Automation",
    copy: "Turn any proven mission into a scheduled workflow with one click.",
  },
];

export default function FeaturesV2() {
  return (
    <section id="product" className="border-b border-line bg-mist">
      <div className="mx-auto max-w-[1180px] px-6 py-24">
        <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <Reveal variant="up">
              <p className="label text-cyan-dark">Workspaces</p>
            </Reveal>
            <Reveal variant="up" delay={80}>
              <h2 className="font-display mt-3 max-w-[16ch] text-[clamp(1.85rem,3.6vw,2.6rem)] leading-[1.08] text-ink">
                Seven surfaces. One brain.
              </h2>
            </Reveal>
          </div>
          <Reveal variant="up" delay={160}>
            <p className="max-w-[38ch] text-[15px] leading-relaxed text-body">
              You never pick a tool. OPTIMUS opens the surface the work needs and
              hands off between them mid-mission.
            </p>
          </Reveal>
        </div>

        {/* E05 reveal · E20 spotlight · E21 edge glow · E22 lift · E25 bounce */}
        <ul className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ Icon, name, copy, span, feature }, i) => (
            <li key={name} className={span ?? ""}>
              <Reveal variant="up" delay={i * 70} className="h-full">
                <Spot className="h-full">
                  <div
                    className={`fx-spot fx-edge fx-lift group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 ${
                      feature ? "sm:p-6" : ""
                    }`}
                  >
                    {feature && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,var(--color-cyan-soft),transparent)] opacity-70"
                      />
                    )}

                    <span
                      className={`relative grid place-items-center rounded-xl border border-line bg-sky text-cyan-dark transition group-hover:border-cyan/45 ${
                        feature ? "h-11 w-11" : "h-9 w-9"
                      }`}
                    >
                      <Icon className={`fx-bounce ${feature ? "h-5 w-5" : "h-[17px] w-[17px]"}`} />
                    </span>

                    <h3
                      className={`relative mt-4 font-semibold text-ink ${
                        feature ? "text-[18px]" : "text-[15px]"
                      }`}
                    >
                      {name}
                    </h3>
                    <p
                      className={`relative mt-2 leading-relaxed text-muted ${
                        feature ? "max-w-[46ch] text-[14px]" : "text-[13px]"
                      }`}
                    >
                      {copy}
                    </p>

                    <span className="relative mt-auto flex items-center gap-1.5 pt-4 text-[12.5px] font-medium text-cyan-dark opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      Explore
                      <ArrowRight className="fx-nudge h-3.5 w-3.5" />
                    </span>

                    {/* bottom hairline that draws in on hover */}
                    <span
                      aria-hidden
                      style={vars({ "--fx-d": "0ms" })}
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-cyan transition-transform duration-500 ease-out group-hover:scale-x-100"
                    />
                  </div>
                </Spot>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
