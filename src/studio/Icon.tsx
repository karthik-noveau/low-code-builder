import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  edit: "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15v5Z",
  checklist: "m3 6 2 2 3-4M11 6h10m-18 8 2 2 3-4M11 14h10M11 21h10",
  command:
    "M8 8V5a3 3 0 1 0-3 3h14a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H5a3 3 0 1 0 3 3V8Z",
  plus: "M12 5v14M5 12h14",
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
export function Icon({
  name,
  size = 18,
  className = "",
  style,
}: {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name] ?? paths.grid} />
    </svg>
  );
}
