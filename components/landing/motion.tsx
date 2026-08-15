"use client";

/**
 * The only client-side motion on the v1 page. Two triggers, both in-view based:
 * a count-up for the stats, and a self-completing loop for the ring diagram.
 *
 * Nothing here is scroll-scrubbed. Scroll-scrubbing ties an animation's
 * progress to scroll position, which means it runs backwards when the user
 * scrolls up and never reaches its end state unless they scroll exactly right.
 * These play forward to completion on their own once seen.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

const MOTION_Q = "(prefers-reduced-motion: reduce)";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MOTION_Q);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_Q).matches,
    () => false,
  );
}

/** Fires once, when the element first scrolls into view. */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  return { ref, inView };
}

/**
 * Runs 0 → 1 once the section is seen, holds at the top, then repeats.
 * `cycleMs` is the sweep; `holdMs` is the pause at 100% before restarting.
 */
export function useAutoLoop(cycleMs = 7000, holdMs = 1600) {
  const { ref, inView } = useInView<HTMLElement>(0.25);
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    let start = 0;
    const total = cycleMs + holdMs;
    const tick = (now: number) => {
      if (!start) start = now;
      const elapsed = (now - start) % total;
      setT(elapsed >= cycleMs ? 1 : elapsed / cycleMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, cycleMs, holdMs]);

  // Reduced motion shows the completed loop — the end state, fully legible.
  return { ref, t: reduced ? 1 : t };
}

/** Counts up to `to` when scrolled into view. */
export function CountUp({
  to,
  suffix = "",
  duration = 1700,
  className = "",
}: {
  to: number;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      // easeOutExpo — quick start, long settle. Reads as landing on a value.
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(to * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to, duration]);

  return (
    <span ref={ref} className={className}>
      {Math.round(reduced ? to : n).toLocaleString()}
      {suffix}
    </span>
  );
}

/**
 * Hero-card treatment: a slight 3D tilt plus the cursor position published as
 * --mx/--my so the spotlight and edge-glow can follow the pointer.
 *
 * Reserved for the hero card only. The small feature cards deliberately do NOT
 * get this — at that size a glow chasing the cursor reads as noise. A big
 * surface can carry it; a 200px card can't.
 */
export function Tilt({
  children,
  className = "",
  max = 4,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
      if (reduced) return;
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
    },
    [max, reduced],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`tilt ${className}`}>
      {children}
    </div>
  );
}
