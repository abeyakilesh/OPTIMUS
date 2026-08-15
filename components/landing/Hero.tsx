import { Tilt } from "./motion";
import {
  ArrowRight,
  Check,
  Play,
  Logo,
  MissionIcon,
  BrowserIcon,
  CodeIcon,
  ResearchIcon,
  DesignIcon,
  WorkflowIcon,
} from "./Icons";

const BADGES = ["No credit card", "Free forever plan", "1 min setup"];

const COMPOSER_TOOLS = ["Attach", "Web", "Files", "Connect"];

const MISSIONS = [
  {
    Icon: BrowserIcon,
    title: "Build a Restaurant Website",
    copy: "1 landing page and 5 other pages.",
    tag: "Web Development",
  },
  {
    Icon: CodeIcon,
    title: "Prototype → Production",
    copy: "Build prototype first, then make it production-grade.",
    tag: "Software Development",
  },
  {
    Icon: MissionIcon,
    title: "Show me how OPTIMUS works",
    copy: "Watch OPTIMUS plan, research and build.",
    tag: "OPTIMUS Demo",
  },
  {
    Icon: ResearchIcon,
    title: "Market Research Report",
    copy: "Research competitors and create a sourced report.",
    tag: "Research",
  },
  {
    Icon: DesignIcon,
    title: "Design SaaS Dashboard",
    copy: "Create a modern dashboard UI/UX.",
    tag: "Design",
  },
  {
    Icon: WorkflowIcon,
    title: "Automate a Workflow",
    copy: "Automate a repetitive business process.",
    tag: "Automation",
  },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_75%_0%,var(--color-sky)_0%,transparent_70%)]"
      />

      <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:py-20">
        {/* ══ copy ══ */}
        <div>
          <h1 className="font-display text-[clamp(2.5rem,5vw,3.4rem)] leading-[1.02] text-ink">
            One objective.
            <br />
            Everything it takes
            <br />
            to get it done.
          </h1>

          <p className="mt-6 max-w-[44ch] text-[16px] leading-relaxed text-body">
            OPTIMUS is the AI-native work environment that plans, acts, verifies
            and remembers. Code, browser, data, design, automation — unified in
            one intelligent workspace.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#start"
              className="group inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-3 text-[15px] font-medium text-white transition hover:bg-ink/88"
            >
              Start for free
              <ArrowRight className="fx-nudge h-4 w-4" />
            </a>
            <a
              href="#how"
              className="inline-flex items-center gap-2 rounded-lg border border-line-2 px-5 py-3 text-[15px] font-medium text-ink transition hover:border-cyan/45 hover:bg-mist"
            >
              <Play className="h-4 w-4 text-cyan" />
              See how it works
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
            {BADGES.map((b) => (
              <li key={b} className="flex items-center gap-1.5 text-[13.5px] text-muted">
                <Check className="h-3.5 w-3.5 text-cyan" />
                {b}
              </li>
            ))}
          </ul>
        </div>

        {/* ══ product preview — the OPTIMUS home screen ══ */}
        <Tilt max={3.5}>
          <div className="spot edge overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,13,14,.04),0_36px_80px_-46px_rgba(11,13,14,.42)]">
            {/* app chrome */}
            <div className="relative z-10 flex items-center gap-3 border-b border-line px-4 py-3">
              <Logo />
              <div className="ml-auto flex items-center gap-3">
                <span className="rounded-md border border-line px-2.5 py-1 text-[11.5px] text-body">
                  Sign in
                </span>
              </div>
            </div>

            <div className="relative z-10 flex">
              {/* left rail */}
              <div className="hidden w-11 shrink-0 flex-col items-center gap-4 border-r border-line py-4 text-faint sm:flex">
                <MissionIcon className="h-4 w-4" />
                <BrowserIcon className="h-4 w-4 text-cyan-dark" />
                <ResearchIcon className="h-4 w-4" />
                <CodeIcon className="h-4 w-4" />
              </div>

              {/* main */}
              <div className="min-w-0 flex-1 px-5 py-7 sm:px-7">
                <h2 className="text-center text-[19px] font-semibold tracking-[-0.02em] text-ink sm:text-[22px]">
                  What do you want to <span className="text-cyan-dark">build</span>?
                </h2>
                <p className="mt-1.5 text-center text-[12.5px] text-muted">
                  OPTIMUS will plan, build, test and deliver — from prototype to
                  production.
                </p>

                {/* composer */}
                <div className="mt-5 rounded-xl border border-line-2 bg-white p-3 shadow-[0_1px_2px_rgba(11,13,14,.03)]">
                  <p className="text-[12.5px] text-faint">
                    Describe your objective in detail…
                  </p>
                  <div className="mt-6 flex items-center gap-1.5">
                    {COMPOSER_TOOLS.map((t) => (
                      <span
                        key={t}
                        className="rounded-md border border-line px-2 py-1 text-[10.5px] text-muted"
                      >
                        {t}
                      </span>
                    ))}
                    <span className="ml-auto grid h-7 w-7 place-items-center rounded-md bg-ink text-white">
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>

                <p className="mt-6 text-[12px] font-medium text-ink">Try a real mission</p>

                <ul className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {MISSIONS.map(({ Icon, title, copy, tag }) => (
                    <li
                      key={title}
                      className="group flex flex-col rounded-lg border border-line bg-white p-2.5 transition hover:border-cyan/45"
                    >
                      <span className="flex items-start gap-1.5">
                        <Icon className="fx-lift-icon mt-[1px] h-3.5 w-3.5 shrink-0 text-cyan-dark" />
                        <span className="text-[11.5px] font-semibold leading-tight text-ink">
                          {title}
                        </span>
                      </span>
                      <span className="mt-1 text-[10.5px] leading-snug text-muted">
                        {copy}
                      </span>
                      <span className="mt-2.5 flex items-center justify-between border-t border-line pt-1.5">
                        <span className="font-data text-[9px] text-faint">{tag}</span>
                        <ArrowRight className="fx-nudge h-3 w-3 text-faint" />
                      </span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-center text-[10.5px] text-faint">
                  OPTIMUS remembers everything. You focus on the outcome.
                </p>
              </div>
            </div>
          </div>
        </Tilt>
      </div>
    </section>
  );
}
