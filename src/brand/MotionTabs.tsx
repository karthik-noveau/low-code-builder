import type { CSSProperties } from "react";

export function MotionTabs({
  options,
  value,
  onChange,
  label,
  className = "",
}: {
  options: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`motion-tabs ${className}`}
      role="group"
      aria-label={label}
      style={
        {
          "--tab-index": Math.max(
            0,
            options.findIndex((option) => option.id === value),
          ),
          "--tab-count": options.length,
        } as CSSProperties
      }
    >
      <span className="motion-tab-indicator" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.id}
          aria-label={option.label}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count !== undefined && (
            <span aria-hidden="true">{option.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
