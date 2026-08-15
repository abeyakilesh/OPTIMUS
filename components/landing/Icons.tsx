import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

/* ── brand mark ── */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 place-items-center rounded-md border border-ink/85">
        <svg {...base} className="h-4 w-4" strokeWidth={1.9}>
          <path d="M4 4 L20 20 M20 4 L4 20" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
        OPTIMUS
      </span>
    </span>
  );
}

/* ── workspace icons ── */
export const MissionIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
);

export const BrowserIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M7 6.5h.01M10 6.5h.01" />
  </svg>
);

export const CodeIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />
  </svg>
);

export const ResearchIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6" />
    <path d="M20 20l-4.5-4.5" />
  </svg>
);

export const DataIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4" />
  </svg>
);

export const DesignIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 3.5v5M12 15.5v5M3.5 12h5M15.5 12h5" />
  </svg>
);

export const WorkflowIcon = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="18" cy="12" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8.5 7.2 15.6 11M15.6 13 8.5 16.8" />
  </svg>
);

/* ── loop icons ── */
export const PlanIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 6h11M8 12h11M8 18h11M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const ActIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M8 5.5v13l10-6.5-10-6.5z" />
  </svg>
);

export const VerifyIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3l7.5 3v6c0 4.5-3.2 7.6-7.5 9-4.3-1.4-7.5-4.5-7.5-9V6L12 3z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
);

export const EvidenceIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
    <path d="M14 3v5h5M9 14h6M9 17h4" />
  </svg>
);

export const RememberIcon = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3a6 6 0 0 0-6 6c0 2 1 3 1 5h10c0-2 1-3 1-5a6 6 0 0 0-6-6z" />
    <path d="M9.5 18h5M10.5 21h3" />
  </svg>
);

/* ── ui glyphs ── */
export const ArrowRight = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

export const Check = (p: P) => (
  <svg {...base} {...p} strokeWidth={2}>
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);

export const Play = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l6-3.5-6-3.5z" />
  </svg>
);

export const ChevronDown = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </svg>
);

export const Globe = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
  </svg>
);

export const MonitorIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

export const WindowIcon = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </svg>
);
