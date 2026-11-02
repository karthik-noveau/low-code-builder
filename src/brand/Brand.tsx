import { useId } from "react";

/** The Skynoveau mark: a nova and a smaller star on a sky-to-violet tile. */
export function Brand({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  // Per instance: a gradient inside a hidden logo stops rendering elsewhere.
  const sky = `sky${useId().replace(/[^\w-]/g, "")}`;
  return (
    <span className={`brand-lockup ${className}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true" className="brand-mark">
        <defs>
          <linearGradient
            id={sky}
            x1="0"
            y1="0"
            x2="36"
            y2="36"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#38bdf8" />
            <stop offset="0.55" stopColor="#5646e6" />
            <stop offset="1" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* Inline fills win over the older per-page logo colours. */}
        <rect
          className="brand-mark-background"
          width="36"
          height="36"
          rx="10"
          style={{ fill: `url(#${sky})` }}
        />
        <path
          className="brand-mark-cutout"
          style={{ fill: "#fff" }}
          d="M16 8.5c.8 5 3.9 8.1 8.9 8.9-5 .8-8.1 3.9-8.9 8.9-.8-5-3.9-8.1-8.9-8.9 5-.8 8.1-3.9 8.9-8.9Z"
        />
        <path
          className="brand-mark-cutout"
          style={{ fill: "#fff", opacity: 0.85 }}
          d="M26.5 7c.3 1.9 1.4 3 3.3 3.3-1.9.3-3 1.4-3.3 3.3-.3-1.9-1.4-3-3.3-3.3 1.9-.3 3-1.4 3.3-3.3Z"
        />
      </svg>
      {!compact && <span className="brand-wordmark">skynoveau</span>}
    </span>
  );
}
export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      {diagonal ? (
        <path d="M6 18 18 6M6 6h12v12" />
      ) : (
        <path d="M4 12h15m-6-6 6 6-6 6" />
      )}
    </svg>
  );
}
