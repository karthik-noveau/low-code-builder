/** The owner app's icons: the Dhanlaxmi reference set, 24px grid, 1.7 stroke. */
const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="8.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7.5" height="9.5" rx="1.5" />
      <rect x="3" y="14.5" width="7.5" height="6.5" rx="1.5" />
    </>
  ),
  users: (
    <>
      <path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="9" cy="7" r="3.5" />
      <path d="M22 20v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M16 3.6a4 4 0 0 1 0 7.75" />
    </>
  ),
  inbox: (
    <>
      <path d="M21 12.5V18a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18v-5.5" />
      <path d="M3 12.5 5.6 4.8A2 2 0 0 1 7.5 3.5h9a2 2 0 0 1 1.9 1.3L21 12.5" />
      <path d="M3 12.5h5l1.2 2.2h5.6l1.2-2.2h5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 6.5-2.5 8-2.5 8h17S18 15 18 8.5" />
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
    </>
  ),
  bellOff: (
    <>
      <path d="M13.7 20a2 2 0 0 1-3.4 0" />
      <path d="M18 8.5a6 6 0 0 0-8.9-5.2" />
      <path d="M6.3 6.3A6 6 0 0 0 6 8.5c0 6.5-2.5 8-2.5 8h13" />
      <path d="m2 2 20 20" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m21 21-5.9-5.9" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m20 6-11 11-5-5" />,
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m8 12.2 2.7 2.6L16 9.5" />
    </>
  ),
  x: <path d="M18 6 6 18M6 6l12 12" />,
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15 9-6 6M9 9l6 6" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5M12 17.2h.01" />
    </>
  ),
  alertCircle: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 7.5V13M12 16.5h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 16v-4.5M12 8h.01" />
    </>
  ),
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  panelLeft: (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="2.5" />
      <path d="M9.5 3.5v17" />
    </>
  ),
  logOut: (
    <>
      <path d="M9 21H5.5A2.5 2.5 0 0 1 3 18.5v-13A2.5 2.5 0 0 1 5.5 3H9" />
      <path d="m16 16 5-4-5-4" />
      <path d="M21 12H9" />
    </>
  ),
  edit: (
    <>
      <path d="M11 4H5.5A2.5 2.5 0 0 0 3 6.5v12A2.5 2.5 0 0 0 5.5 21h12a2.5 2.5 0 0 0 2.5-2.5V13" />
      <path d="M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M18.5 6v13a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  phone: (
    <path d="M21.5 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.6 4.2 2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L7.6 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z" />
  ),
  mail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="m3 7 8.1 5.6a2 2 0 0 0 2 0L21 7" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 7.5V6a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20H19a2 2 0 0 0 2-2v-1.5" />
      <path d="M21.5 11h-5a2.5 2.5 0 0 0 0 5h5a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 0-.5-.5Z" />
    </>
  ),
  receipt: (
    <>
      <path d="M7.5 3.25h9a3.25 3.25 0 0 1 3.25 3.25v13a.75.75 0 0 1-1.08.67L16 18.85l-3.66 1.8a.75.75 0 0 1-.68 0L8 18.85l-2.67 1.32a.75.75 0 0 1-1.08-.67v-13A3.25 3.25 0 0 1 7.5 3.25Z" />
      <path d="M8 8.25h8M8 12.5h4M15.5 12.5h.5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M12 6.8V12l3.3 2" />
    </>
  ),
  trendingUp: (
    <>
      <path d="m22 7-8.5 8.5-5-5L2 17" />
      <path d="M16 7h6v6" />
    </>
  ),
  userPlus: (
    <>
      <path d="M15 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20" />
      <circle cx="8.5" cy="7" r="3.5" />
      <path d="M19 8v6M22 11h-6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </>
  ),
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronUp: <path d="m19 15-7-7-7 7" />,
  smartphone: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>
  ),
  monitor: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="2.5" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8.2V20l-4-2v-4.8Z" />,
  moreVertical: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
  externalLink: (
    <>
      <path d="M14 3h7v7" />
      <path d="M21 3 10.5 13.5" />
      <path d="M19 14v5.5A1.5 1.5 0 0 1 17.5 21h-13A1.5 1.5 0 0 1 3 19.5v-13A1.5 1.5 0 0 1 4.5 5H10" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 20h16" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 1.5v2.5M12 20v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M1.5 12H4M20 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8" />
    </>
  ),
  moon: <path d="M21 13.4A8.6 8.6 0 1 1 10.6 3a6.9 6.9 0 0 0 10.4 10.4Z" />,
  shield: (
    <>
      <path d="M12 2.5 4 6v6c0 5 3.4 8.6 8 9.5 4.6-.9 8-4.5 8-9.5V6Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M10 5.2A9.9 9.9 0 0 1 12 5c6.2 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.2" />
      <path d="M6.3 6.4A17.4 17.4 0 0 0 2 12s3.8 7 10 7a9.7 9.7 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </>
  ),
  box: (
    <>
      <path d="M21 8.5v7a2 2 0 0 1-1 1.7l-7 4a2 2 0 0 1-2 0l-7-4a2 2 0 0 1-1-1.7v-7a2 2 0 0 1 1-1.7l7-4a2 2 0 0 1 2 0l7 4a2 2 0 0 1 1 1.7Z" />
      <path d="m3.3 7.5 8.7 5 8.7-5M12 21.5v-9" />
    </>
  ),
  folder: (
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
  ),
};
export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * The shop's mark: "bolt" is the Dhanlaxmi lightning bolt in a circle; an
 * image address shows the image; with neither, the shop's initial in a ring.
 */
export function ShopMark({
  logo,
  name,
  size = 40,
}: {
  logo?: string;
  name: string;
  size?: number;
}) {
  if (logo && logo !== "bolt")
    return (
      <img
        className="ow-markImage"
        src={logo}
        alt=""
        width={size}
        height={size}
      />
    );
  return (
    <svg
      className="ow-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
    >
      <circle
        cx="20"
        cy="20"
        r="19"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      {logo === "bolt" ? (
        <path
          d="M22.4 8 13 22.1a.7.7 0 0 0 .58 1.1h5.2l-1.3 8.8 9.5-14.2a.7.7 0 0 0-.58-1.1h-5.2L22.4 8Z"
          fill="currentColor"
        />
      ) : (
        <text
          x="20"
          y="26"
          textAnchor="middle"
          fontSize="17"
          fontWeight="700"
          fill="currentColor"
        >
          {(name.trim()[0] ?? "S").toUpperCase()}
        </text>
      )}
    </svg>
  );
}
