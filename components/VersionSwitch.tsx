import Link from "next/link";

/**
 * Top-right pill that flips between the two landing pages.
 * v1 = the calm, static original. v2 = the animated version.
 * Temporary while the direction is being chosen — delete the loser.
 */
export default function VersionSwitch({ to }: { to: "v1" | "v2" }) {
  const goingToV2 = to === "v2";

  return (
    <Link
      href={goingToV2 ? "/v2" : "/"}
      title={goingToV2 ? "Switch to landing page 2.0" : "Back to landing page 1.0"}
      className="group relative inline-flex shrink-0 items-center gap-1.5 rounded-full border border-cyan/45 bg-sky px-2.5 py-1 text-[11.5px] font-semibold text-cyan-dark transition hover:border-cyan hover:bg-cyan-soft"
    >
      {goingToV2 && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="fx-ping absolute inline-flex h-full w-full rounded-full bg-cyan" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan" />
        </span>
      )}
      {goingToV2 ? "v2.0" : "v1.0"}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="fx-nudge h-3 w-3"
      >
        <path d={goingToV2 ? "M5 12h13M13 6l6 6-6 6" : "M19 12H6M11 18l-6-6 6-6"} />
      </svg>
    </Link>
  );
}
