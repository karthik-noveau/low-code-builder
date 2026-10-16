export function Brand({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`brand-lockup ${className}`}>
      <svg viewBox="0 0 36 36" aria-hidden="true" className="brand-mark">
        <rect
          className="brand-mark-background"
          width="36"
          height="36"
          rx="10"
        />
        <path className="brand-mark-cutout" d="M9 8h19v6H15v5h11v6H15v4H9Z" />
      </svg>
      {!compact && <span className="brand-wordmark">forma</span>}
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
