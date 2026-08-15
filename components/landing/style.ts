import type { CSSProperties } from "react";

/**
 * Lets a style object carry CSS custom properties (--fx-d, --fx-dur, …).
 *
 * Deliberately NOT in motion.tsx: that module is "use client", so a plain
 * function exported from it becomes a client reference and throws when a
 * server component calls it during render. Server and client both import
 * `v` from here.
 */
export function v(o: Record<string, string | number>): CSSProperties {
  return o as CSSProperties;
}
