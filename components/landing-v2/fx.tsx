"use client";

/**
 * OPTIMUS landing v2 — motion primitives.
 *
 * Companion to app/v2/v2.css. The CSS owns the *look* of each effect; this
 * file owns the *trigger* (in-view, pointer, scroll, time). Effects E53–E60
 * live here; everything else here just drives a CSS class or custom property.
 *
 * Every primitive degrades to a static, fully legible state when
 * `prefers-reduced-motion: reduce` is set.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { vars } from "./style";

/* ── shared helpers ─────────────────────────────────────────────────── */

const MOTION_Q = "(prefers-reduced-motion: reduce)";

/** Imperative check — for use inside event handlers and effect bodies. */
function prefersReduced() {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOTION_Q).matches;
}

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MOTION_Q);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Reactive version, for components that must know at *render* time whether to
 * animate. useSyncExternalStore rather than useState-in-an-effect, so there is
 * no cascading render and it stays correct if the OS setting flips mid-session.
 */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_Q).matches,
    () => false, // server snapshot: assume motion is fine, CSS handles the rest
  );
}

/**
 * Fires once when the element scrolls into view. Deps are primitives so the
 * observer isn't torn down and rebuilt on every render.
 */
export function useInView<T extends HTMLElement>(
  once = true,
  rootMargin = "0px 0px -12% 0px",
  threshold = 0.15,
) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // Browser too old to observe — reveal everything rather than leave the
      // page invisible. Deferred so it isn't a synchronous setState.
      queueMicrotask(() => setInView(true));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, rootMargin, threshold]);

  return { ref, inView };
}

/* ── E01–E08 · reveal on scroll ─────────────────────────────────────── */

type RevealVariant = "up" | "down" | "left" | "right" | "scale" | "blur" | "rot" | "clip";

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  once = true,
}: {
  children: ReactNode;
  variant?: RevealVariant;
  delay?: number;
  className?: string;
  once?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(once);
  return (
    <div
      ref={ref}
      style={vars({ "--fx-d": `${delay}ms` })}
      className={`fx-r fx-r-${variant} ${inView ? "fx-in" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Marks a whole subtree as "in view" so descendants using `.fx-in .fx-draw`,
 * `.fx-in .fx-fill` etc. animate together. Adds no visual style of its own.
 */
export function InViewGroup({
  children,
  className = "",
  once = true,
}: {
  children: ReactNode;
  className?: string;
  once?: boolean;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(once);
  return (
    <div ref={ref} className={`${inView ? "fx-in" : ""} ${className}`}>
      {children}
    </div>
  );
}

/* ── E09 · masked word-by-word headline ─────────────────────────────── */

export function Words({
  text,
  className = "",
  start = 0,
  step = 60,
}: {
  text: string;
  className?: string;
  start?: number;
  step?: number;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(true, "0px", 0.2);
  const words = text.split(" ");
  return (
    <span ref={ref} className={`${inView ? "fx-in" : ""} ${className}`}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`}>
          <span className="fx-word" style={vars({ "--fx-d": `${start + i * step}ms` })}>
            <span>{w}</span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

/* ── E53 · rotating typewriter ──────────────────────────────────────── */

export function Typewriter({
  words,
  className = "",
  typeMs = 62,
  eraseMs = 28,
  holdMs = 1700,
}: {
  words: string[];
  className?: string;
  typeMs?: number;
  eraseMs?: number;
  holdMs?: number;
}) {
  const [i, setI] = useState(0);
  const [len, setLen] = useState(0);
  const [erasing, setErasing] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const word = words[i % words.length];
    let t: number;
    if (!erasing && len < word.length) {
      t = window.setTimeout(() => setLen(len + 1), typeMs);
    } else if (!erasing && len === word.length) {
      t = window.setTimeout(() => setErasing(true), holdMs);
    } else if (erasing && len > 0) {
      t = window.setTimeout(() => setLen(len - 1), eraseMs);
    } else {
      t = window.setTimeout(() => {
        setErasing(false);
        setI((v) => (v + 1) % words.length);
      }, 220);
    }
    return () => window.clearTimeout(t);
  }, [i, len, erasing, words, typeMs, eraseMs, holdMs, reduced]);

  // Reduced motion (and the server render) shows the first phrase, complete.
  const shown = reduced ? words[0] : words[i % words.length].slice(0, len);

  return (
    <span className={className}>
      {shown}
      <span className="fx-caret ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.12em] bg-cyan" />
    </span>
  );
}

/* ── E54 · count-up ─────────────────────────────────────────────────── */

export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1500,
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>(true);
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      // easeOutExpo — fast start, long settle. Reads as "landing on a value".
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(to * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, reduced]);

  // Reduced motion jumps straight to the final figure.
  const text = (reduced ? to : n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

/* ── E55 · text scramble / decode ───────────────────────────────────── */

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#";

export function Scramble({ text, className = "" }: { text: string; className?: string }) {
  const { ref, inView } = useInView<HTMLSpanElement>(true);
  // Server and first client render both show the real text — no hydration gap.
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (!inView || prefersReduced()) return;
    let frame = 0;
    let raf = 0;
    const total = text.length * 3 + 18;
    const run = () => {
      frame += 1;
      const revealed = Math.floor((frame / total) * text.length * 1.6);
      setOut(
        text
          .split("")
          .map((c, idx) => {
            if (c === " ") return " ";
            if (idx < revealed) return c;
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join(""),
      );
      if (frame < total) raf = requestAnimationFrame(run);
      else setOut(text);
    };
    raf = requestAnimationFrame(run);
    return () => cancelAnimationFrame(raf);
  }, [inView, text]);

  return (
    <span ref={ref} className={className}>
      {out}
    </span>
  );
}

/* ── E19/E20/E21 · tilt + spotlight ─────────────────────────────────── */

export function Tilt({
  children,
  className = "",
  max = 5,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (!el || prefersReduced()) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty("--mx", `${px * 100}%`);
      el.style.setProperty("--my", `${py * 100}%`);
    },
    [max],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }, []);

  return (
    <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`fx-tilt ${className}`}>
      {children}
    </div>
  );
}

/** Spotlight/edge-glow only — no tilt. Use on grid cards. */
export function Spot({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  }, []);
  return (
    <div ref={ref} onMouseMove={onMove} className={className}>
      {children}
    </div>
  );
}

/* ── E56 · magnetic button ──────────────────────────────────────────── */

export function Magnetic({
  children,
  className = "",
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  const onMove = useCallback(
    (e: ReactMouseEvent<HTMLSpanElement>) => {
      const el = ref.current;
      if (!el || prefersReduced()) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * strength}px, ${dy * strength}px)`;
    },
    [strength],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = "translate(0,0)";
  }, []);

  return (
    <span
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`inline-block will-change-transform ${className}`}
      style={{ transition: "transform .35s cubic-bezier(.16,1,.3,1)" }}
    >
      {children}
    </span>
  );
}

/* ── E24 · click ripple ─────────────────────────────────────────────── */

export function Ripple({
  children,
  className = "",
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  const onClick = useCallback((e: ReactMouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    if (prefersReduced()) return;
    const r = el.getBoundingClientRect();
    const dot = document.createElement("span");
    dot.className = "fx-ripple-dot";
    dot.style.left = `${e.clientX - r.left}px`;
    dot.style.top = `${e.clientY - r.top}px`;
    el.appendChild(dot);
    window.setTimeout(() => dot.remove(), 650);
  }, []);

  return (
    <a href={href} onClick={onClick} className={`relative overflow-hidden ${className}`}>
      {children}
    </a>
  );
}

/* ── E42 · scroll progress bar ──────────────────────────────────────── */

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      el.style.setProperty("--fx-p", String(max > 0 ? window.scrollY / max : 0));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-[70] h-[2px] bg-transparent">
      <div ref={ref} className="fx-progress h-full bg-cyan" />
    </div>
  );
}

/* ── E43 · cursor spotlight ─────────────────────────────────────────── */

export function CursorGlow() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (prefersReduced()) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      raf = 0;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--cx", `${x}px`);
        el.style.setProperty("--cy", `${y}px`);
      }
    };
    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className="fx-cursor" />;
}

/* ── E57 · drifting data motes (canvas) ─────────────────────────────── */

export function Motes({ count = 34, className = "" }: { count?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv || prefersReduced()) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    type M = { x: number; y: number; r: number; v: number; a: number; drift: number };
    let motes: M[] = [];

    const seed = () => {
      const parent = cv.parentElement;
      w = parent?.clientWidth ?? cv.clientWidth;
      h = parent?.clientHeight ?? cv.clientHeight;
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.7 + Math.random() * 1.7,
        v: 0.12 + Math.random() * 0.34,
        a: 0.16 + Math.random() * 0.34,
        drift: (Math.random() - 0.5) * 0.16,
      }));
    };

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.y -= m.v;
        m.x += m.drift;
        if (m.y < -6) {
          m.y = h + 6;
          m.x = Math.random() * w;
        }
        if (m.x < -6) m.x = w + 6;
        if (m.x > w + 6) m.x = -6;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6,182,212,${m.a})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    seed();
    draw();
    const ro = new ResizeObserver(seed);
    if (cv.parentElement) ro.observe(cv.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [count]);

  return <canvas ref={ref} aria-hidden className={className} />;
}

/* ── E58 · live log stream ──────────────────────────────────────────── */

export type LogLine = { t: string; msg: string; kind?: "run" | "pass" | "info" };

export function LiveLog({
  lines,
  visible = 5,
  intervalMs = 1500,
  className = "",
}: {
  lines: LogLine[];
  visible?: number;
  intervalMs?: number;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(true);
  const [n, setN] = useState(visible);

  useEffect(() => {
    if (!inView || prefersReduced()) return;
    const id = window.setInterval(() => setN((v) => v + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [inView, intervalMs]);

  // Rolling window over an infinite repeat of `lines`.
  const window_ = useMemo(() => {
    const out: (LogLine & { key: string })[] = [];
    for (let i = n - visible; i < n; i++) {
      const src = lines[((i % lines.length) + lines.length) % lines.length];
      out.push({ ...src, key: `${i}` });
    }
    return out;
  }, [n, visible, lines]);

  const tone = (k?: LogLine["kind"]) =>
    k === "pass" ? "text-pass" : k === "run" ? "text-run" : "text-faint";

  return (
    <div ref={ref} className={className}>
      {window_.map((l, i) => (
        <div
          key={l.key}
          className="fx-line-in flex items-baseline gap-2 py-[3px] font-mono text-[10.5px] leading-tight"
          style={{ opacity: i === 0 ? 0.35 : i === 1 ? 0.65 : 1 }}
        >
          <span className="shrink-0 tabular-nums text-faint/70">{l.t}</span>
          <span className={`shrink-0 ${tone(l.kind)}`}>
            {l.kind === "pass" ? "✓" : l.kind === "run" ? "▸" : "·"}
          </span>
          <span className="truncate text-body">{l.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ── E59 · scroll-linked section progress ───────────────────────────── */

/** 0 → 1 as the element travels through the viewport. Drives parallax + the loop ring. */
export function useSectionProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = r.height + vh;
      const seen = vh - r.top;
      setP(Math.max(0, Math.min(1, seen / total)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced]);

  // Reduced motion parks the diagram mid-way: fully legible, never moving.
  return { ref, p: reduced ? 0.5 : p };
}

/** E60 · parallax layer — moves at a fraction of scroll speed. */
export function Parallax({
  children,
  amount = 40,
  className = "",
}: {
  children: ReactNode;
  amount?: number;
  className?: string;
}) {
  const { ref, p } = useSectionProgress<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={className}
      style={{ transform: `translate3d(0, ${(0.5 - p) * amount}px, 0)` }}
    >
      {children}
    </div>
  );
}
