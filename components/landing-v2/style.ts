import type { CSSProperties } from "react";

/**
 * Lets a style object carry CSS custom properties (--fx-d, --fx-w, …) without
 * fighting the CSSProperties type.
 *
 * This lives OUTSIDE fx.tsx on purpose: fx.tsx is a "use client" module, so a
 * plain function exported from it becomes a client reference and cannot be
 * called during a server render. Server and client components both import
 * `vars` from here.
 */
export function vars(o: Record<string, string | number>): CSSProperties {
  return o as CSSProperties;
}
