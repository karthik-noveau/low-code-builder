import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  edit: "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15v5Z",
  checklist: "m3 6 2 2 3-4M11 6h10m-18 8 2 2 3-4M11 14h10M11 21h10",
  command:
    "M8 8V5a3 3 0 1 0-3 3h14a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H5a3 3 0 1 0 3 3V8Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  x: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  zap: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  arrowUpRight: "M6 18 18 6M6 6h12v12",
  up: "m6 14 6-6 6 6",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  menu: "M4 7h16M4 12h16M4 17h16",
  pages: "M8 3h7l5 5v13H8V3ZM15 3v6h5M4 6v13",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  tag: "M3 12V4h8l10 10-8 8L3 12ZM7.5 8h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6",
  phone:
    "M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2Z",
  wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3V7Zm0 0 13-4v4M16 13h.01",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a6 6 0 0 0-4-5.7",
  percent:
    "M19 5 5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  plug: "M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0V8ZM12 17v5",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  palette:
    "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-3.5c-.8-.5-.4-2 .6-2H17A4 4 0 0 0 21 11a9 9 0 0 0-9-8ZM7 10h.01M10 6h.01M15 6h.01M18 10h.01",
  image: "M3 4h18v16H3V4Zm0 12 5-5 5 5 3-3 5 5M15 8h.01",
  gallery: "M7 3h14v14H7V3ZM3 7v14h14M7 13l4-4 4 4 2-2 4 4",
  grid: "M3 3h7v7H3V3Zm11 0h7v7h-7V3ZM3 14h7v7H3v-7Zm11 0h7v7h-7v-7Z",
  settings:
    "m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 1-4-2-2-1-3-3-1-2-1-2 1Zm2 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  help: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z",
  undo: "M3 9h10a6 6 0 0 1 0 12M3 9l5-5M3 9l5 5",
  redo: "M21 9H11a6 6 0 0 0 0 12M21 9l-5-5M21 9l-5 5",
  desktop: "M3 3h18v13H3V3ZM12 16v5M8 21h8",
  tablet: "M5 2h14v20H5V2ZM11 18h2",
  mobile: "M7 2h10v20H7V2ZM11 18h2",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  play: "M3 5h18v14H3V5Zm7 4v6l5-3-5-3Z",
  eyeOff:
    "m3 3 18 18M10 5h2c6 0 10 7 10 7a23 23 0 0 1-3 4M6 6a23 23 0 0 0-4 6s4 7 10 7c2 0 4-1 5-2",
  export: "M12 15V2m-5 5 5-5 5 5M4 13v8h16v-8",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6",
  home: "m3 10 9-7 9 7v11H3V10Zm6 11v-8h6v8",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2c5 5 5 15 0 20-5-5-5-15 0-20Z",
  lock: "M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 8 0v4",
  store: "M5 8h14l-1.2 12H6.2L5 8Zm4 0V7a3 3 0 0 1 6 0v1",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
  copy: "M8 8h13v13H8V8ZM16 8V3H3v13h5",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7",
  panelTop: "M3 3h18v18H3V3ZM3 9h18",
  panelBottom: "M3 3h18v18H3V3ZM3 15h18",
  panel: "M3 3h18v18H3V3ZM12 3v18",
  columns: "M3 5h5v14H3V5Zm7 0h4v14h-4V5Zm6 0h5v14h-5V5Z",
  megaphone: "M3 9h5l12-5v16L8 15H3V9Zm5 6 2 6h4l-3-5",
  type: "M4 5h16M12 5v15M8 20h8M4 5v3M20 5v3",
  quote: "M4 5h6v7H5c0 3 2 4 4 5M14 5h6v7h-5c0 3 2 4 4 5",
  mail: "M3 5h18v14H3V5Zm0 0 9 8 9-8",
  sun: "M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4",
  send: "m3 3 19 9-19 9 4-9-4-9Zm4 9h15",
  leaf: "M20 3C7 2 1 8 5 16s16 3 15-13ZM4 21 16 9",
  truck:
    "M2 5h12v12H2V5Zm12 5h5l3 4v3h-8M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm12 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  heart: "M12 21 3 12C-2 5 7-1 12 6c5-7 14-1 9 6l-9 9Z",
  sparkles: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z",
  code: "m8 5-6 7 6 7M16 5l6 7-6 7m-3-17-2 20",
  folder: "M2 6h8l2 3h10v12H2V6Z",
  alignLeft: "M3 5h18M3 10h12M3 15h18M3 20h12",
  alignCenter: "M3 5h18M6 10h12M3 15h18M6 20h12",
  alignRight: "M3 5h18M9 10h12M3 15h18M9 20h12",
};
/** Every plain icon name (the blocks Inspector's icon picker). */
export const ICON_NAMES = Object.keys(paths);
/** Editor-only glyphs (text tools, layout controls); not offered to websites. */
const editor: Record<string, string> = {
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7V5Zm0 7h7a3.5 3.5 0 0 1 0 7H7v-7Z",
  italic: "M10 5h8M6 19h8M14 5l-4 14",
  keyboard: "M3 6h18v12H3V6Zm4 4h.01M11 10h.01M15 10h.01M7 14h10",
  parent: "M14 9 9 4 4 9M9 4v10a6 6 0 0 0 6 6h5",
  wrap: "M3 3h18v18H3V3Zm5 5h8v8H8V8Z",
  unlock: "M6 10h12v11H6V10Zm2 0V6a4 4 0 0 1 7.7-1.5",
  collapseAll: "m7 20 5-5 5 5M7 4l5 5 5-5",
  expandAll: "m7 15 5 5 5-5M7 9l5-5 5 5",
  stacked: "M5 4h14v6H5V4Zm0 10h14v6H5v-6Z",
  sideBySide: "M4 5h6v14H4V5Zm10 0h6v14h-6V5Z",
  textSmaller: "M3 17 7 7l4 10M4.5 13.5h5M15 12h6",
  textBigger: "M3 17 7 7l4 10M4.5 13.5h5M15 12h6M18 9v6",
  paste: "M9 4h6v3H9V4ZM7 5H5v16h14V5h-2",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  window: "M3 5h18v14H3V5Zm0 4h18M17 7h.01",
  calendar: "M4 6h16v15H4V6Zm0 5h16M8 3v5m8-5v5",
  message: "M4 5h16v11H9l-5 4V5Zm4 5h.01M12 10h.01M16 10h.01",
  toggle:
    "M7 7h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 7Zm10 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  scroll: "M12 4v14m-5-5 5 5 5-5M5 21h14",
};
/**
 * The rewards-site set (a 24px, 1.7 stroke family), drawn exactly as the
 * Dhanlaxmi Rewards reference. Website variants ask for "rw:<name>" and fall
 * back to the plain icon of the same name when there's no refined one.
 */
const refined: Record<string, string> = {
  "rw:bolt":
    "M13 2 4.5 13.2a.6.6 0 0 0 .5 1H11l-1 7 8.5-11.2a.6.6 0 0 0-.5-1H12l1-7Z",
  "rw:info":
    "M2.5 12a9.5 9.5 0 1 0 19 0a9.5 9.5 0 1 0-19 0ZM12 16v-4.5M12 8h.01",
  "rw:phone":
    "M21.5 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 4.2 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.6 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z",
  "rw:receipt":
    "M7.5 3.25h9a3.25 3.25 0 0 1 3.25 3.25v13a.75.75 0 0 1-1.08.67L16 18.85l-3.66 1.8a.75.75 0 0 1-.68 0L8 18.85l-2.67 1.32a.75.75 0 0 1-1.08-.67v-13A3.25 3.25 0 0 1 7.5 3.25ZM8 8.25h8M8 12.5h4M15.5 12.5h.5",
  "rw:bell":
    "M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5M13.7 20a2 2 0 0 1-3.4 0",
  "rw:wallet":
    "M20 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H19a2 2 0 0 0 2-2v-1.5M21.5 11h-5a2.5 2.5 0 0 0 0 5h5a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5Z",
  "rw:arrow": "M5 12h14M13 6l6 6-6 6",
  "rw:sun":
    "M7.8 12a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0ZM12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8",
  "rw:moon": "M21 13.4A8.6 8.6 0 1 1 10.6 3a6.9 6.9 0 0 0 10.4 10.4Z",
  "rw:home":
    "m3 10.5 9-7.5 9 7.5M5.5 9.5V19A2 2 0 0 0 7.5 21h9a2 2 0 0 0 2-2V9.5M9.5 21v-6h5v6",
};
export function Icon({
  name,
  size = 18,
  className = "",
  style,
  strokeWidth = name.startsWith("rw:") ? 1.7 : 1.65,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path
        d={
          refined[name] ??
          paths[name.replace(/^rw:/, "")] ??
          editor[name] ??
          paths.grid
        }
      />
    </svg>
  );
}
