/**
 * Provider marks, drawn as simple geometry rather than fetched wordmarks.
 *
 * Two reasons, both practical: the artifact CSP forbids remote images, and a
 * company's real logo carries trademark constraints this page has no business
 * assuming. These are neutral glyphs in the OPTIMUS palette — identifiable by
 * position and colour, never passed off as official branding.
 */

interface Props {
  className?: string;
}

export function GroqMark({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v9M8.5 10.5l7 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function MistralMark({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M4 19V7h4v4h4V7h4v4h4v8" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function GeminiMark({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3c.6 4.7 4.3 8.4 9 9-4.7.6-8.4 4.3-9 9-.6-4.7-4.3-8.4-9-9 4.7-.6 8.4-4.3 9-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GatewayMark({ className = "" }: Props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="9" width="17" height="6" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6.5M12 9V4.5M17 9V6.5M7 15v2.5M12 15v4.5M17 15v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export const MARKS: Record<string, (p: Props) => React.ReactElement> = {
  groq: GroqMark,
  mistral: MistralMark,
  gemini: GeminiMark,
};
