import { Icon } from "../studio/Icon";
import { useThemePreference, type ThemePreference } from "./theme";
import "./theme-switch.css";

const OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "dark", label: "Dark", icon: "moon" },
  { id: "system", label: "System", icon: "desktop" },
];

/**
 * Light / Dark / System. "segmented" shows all three (menus, settings);
 * "button" is one icon button that cycles through them (headers).
 */
export function ThemeSwitch({
  variant = "segmented",
  className = "",
}: {
  variant?: "segmented" | "button";
  className?: string;
}) {
  const [preference, setPreference] = useThemePreference();
  if (variant === "button") {
    const index = OPTIONS.findIndex((o) => o.id === preference);
    const current = OPTIONS[index];
    const next = OPTIONS[(index + 1) % OPTIONS.length];
    return (
      <button
        type="button"
        className={`theme-cycle ${className}`}
        aria-label={`Theme: ${current.label}. Switch to ${next.label.toLowerCase()}.`}
        title={`Theme: ${current.label}`}
        onClick={() => setPreference(next.id)}
      >
        <Icon name={current.icon} size={16} />
      </button>
    );
  }
  return (
    <div
      className={`theme-switch ${className}`}
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={preference === option.id}
          onClick={() => setPreference(option.id)}
        >
          <Icon name={option.icon} size={14} />
          {option.label}
        </button>
      ))}
    </div>
  );
}
