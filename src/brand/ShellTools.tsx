import { useEffect, useMemo, useRef, useState } from "react";
import { ago, loadNotices, loadSites, type Notice } from "./activity";
import { Icon } from "../studio/Icon";
import { navigate } from "./navigation";
import * as cloud from "../cloud/client";

/** Something the search can jump to: a link or an action on the current page. */
export interface SearchItem {
  id: string;
  label: string;
  group: string;
  hint?: string;
  icon?: string;
  href?: string;
  run?: () => void;
}

const PLACES: SearchItem[] = [
  {
    id: "go-websites",
    label: "Your websites",
    group: "Go to",
    icon: "grid",
    href: "/workspace",
  },
  {
    id: "go-new",
    label: "Create website",
    group: "Go to",
    icon: "plus",
    href: "/new",
  },
  {
    id: "go-store",
    label: "Store management",
    group: "Go to",
    icon: "store",
    href: "/commerce",
  },
  {
    id: "go-templates",
    label: "Templates",
    group: "Go to",
    icon: "panel",
    href: "/workspace/templates",
  },
  {
    id: "go-account",
    label: "Account settings",
    hint: "Password, sessions",
    group: "Go to",
    icon: "settings",
    href: "/account",
  },
  {
    id: "go-draft",
    label: "Browser draft",
    group: "Go to",
    icon: "edit",
    href: "/editor",
  },
  {
    id: "go-help",
    label: "Guides & help",
    group: "Go to",
    icon: "help",
    href: "/help",
  },
];
function siteItems(sites: cloud.Site[]): SearchItem[] {
  return sites.flatMap((site) => [
    {
      id: `${site.id}-edit`,
      label: site.name,
      hint: "Open editor",
      group: "Websites",
      icon: "edit",
      href: `/editor?site=${site.id}`,
    },
    {
      id: `${site.id}-domains`,
      label: `${site.name} · Domains & publishing`,
      group: "Websites",
      icon: "globe",
      href: `/domains?site=${site.id}`,
    },
    {
      id: `${site.id}-store`,
      label: `${site.name} · Store`,
      group: "Websites",
      icon: "store",
      href: `/commerce?site=${site.id}`,
    },
    {
      id: `${site.id}-inbox`,
      label: `${site.name} · Inbox`,
      hint: "Orders, bookings and messages",
      group: "Websites",
      icon: "mail",
      href: `/editor?site=${site.id}&open=inbox`,
    },
    ...(site.url
      ? [
          {
            id: `${site.id}-visit`,
            label: `${site.name} · Visit live site`,
            group: "Websites",
            icon: "arrowUpRight",
            href: site.url,
          },
        ]
      : []),
  ]);
}
const matches = (item: SearchItem, query: string) => {
  const text = `${item.label} ${item.hint ?? ""} ${item.group}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
};

/** The top bar search: ⌘K / Ctrl+K anywhere opens it. */
export function GlobalSearch({ extra = [] }: { extra?: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [sites, setSites] = useState<cloud.Site[]>([]);
  const [sitesFailed, setSitesFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        setActive(0);
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // Each opening starts from an empty query.
  const show = () => {
    setQuery("");
    setActive(0);
    setSitesFailed(false);
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    let live = true;
    loadSites()
      .then((list) => live && setSites(list))
      // Pages and actions still search; say why websites are missing.
      .catch(() => live && setSitesFailed(true));
    return () => {
      live = false;
    };
  }, [open]);
  const results = useMemo(() => {
    const all = [...extra, ...siteItems(sites), ...PLACES];
    const found = query.trim()
      ? all.filter((item) => matches(item, query))
      : // Without a query, show the page's own shortcuts and where to go.
        [...extra.slice(0, 6), ...siteItems(sites).slice(0, 5), ...PLACES];
    return found.slice(0, 40);
  }, [extra, sites, query]);
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };
  const choose = (item: SearchItem | undefined) => {
    if (!item) return;
    setOpen(false);
    if (item.run) item.run();
    else if (item.href) {
      if (/^https?:/.test(item.href))
        window.open(item.href, "_blank", "noopener,noreferrer");
      else navigate(item.href);
    }
  };
  let lastGroup = "";
  return (
    <>
      <button
        ref={opener}
        className="admin-search"
        onClick={show}
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
      >
        <Icon name="search" size={15} />
        <span>Search</span>
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div
          className="admin-palette-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            className="admin-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
          >
            <div className="admin-palette-input">
              <Icon name="search" size={17} />
              <input
                ref={input}
                role="combobox"
                aria-expanded="true"
                aria-controls="admin-palette-results"
                aria-activedescendant={
                  results[active] ? `palette-${results[active].id}` : undefined
                }
                placeholder="Search websites, store, settings…"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                  // The results are picked with the arrows, so Tab stays here.
                  else if (event.key === "Tab") event.preventDefault();
                  else if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActive((i) => Math.min(results.length - 1, i + 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActive((i) => Math.max(0, i - 1));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    choose(results[active]);
                  }
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <ul id="admin-palette-results" role="listbox" aria-label="Results">
              {sitesFailed && (
                <li className="admin-palette-empty">
                  Couldn’t load your websites. Close and reopen search to try
                  again.
                </li>
              )}
              {!results.length && (
                <li className="admin-palette-empty">
                  Nothing matches “{query}”.
                </li>
              )}
              {results.map((item, i) => {
                const heading = item.group !== lastGroup && item.group;
                lastGroup = item.group;
                return (
                  <li key={item.id} role="presentation">
                    {heading && (
                      <span className="admin-palette-group">{heading}</span>
                    )}
                    <div
                      id={`palette-${item.id}`}
                      role="option"
                      aria-selected={i === active}
                      className="admin-palette-item"
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(item)}
                    >
                      <span className="admin-palette-icon">
                        <Icon name={item.icon ?? "chevron"} size={15} />
                      </span>
                      <span className="admin-palette-label">{item.label}</span>
                      {item.hint && <small>{item.hint}</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
            <footer>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> to move
              </span>
              <span>
                <kbd>↵</kbd> to open
              </span>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function readSeen(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

/** The bell: new requests, payments and publishing problems across websites. */
export function Notifications({ account }: { account: string }) {
  const key = `forma-notifications-seen:${account}`;
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState(false);
  const [seen, setSeen] = useState(() => readSeen(key));
  const [open, setOpen] = useState(false);
  // What was unread when the panel opened stays highlighted while it's open.
  const [openedSeen, setOpenedSeen] = useState(seen);
  const root = useRef<HTMLDivElement>(null);
  const fetchNotices = () =>
    loadNotices()
      .then((list) => {
        setNotices(list);
        setError(false);
      })
      .catch(() => setError(true));
  const load = () => {
    setError(false);
    void fetchNotices();
  };
  useEffect(() => {
    // The account's read mark wins when another browser read further.
    cloud
      .notificationsSeen()
      .then(({ seenAt }) => {
        if (!seenAt) return;
        setSeen((local) => (seenAt > local ? seenAt : local));
        setOpenedSeen((local) => (seenAt > local ? seenAt : local));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    void fetchNotices();
    // New orders and bookings show up without a reload while the tab is in view.
    const timer = setInterval(() => {
      if (!document.hidden) void fetchNotices();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", outside);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const unread = (notices ?? []).filter((n) => n.at > seen).length;
  const markSeen = () => {
    const now = new Date().toISOString();
    setSeen(now);
    try {
      localStorage.setItem(key, now);
    } catch {
      /* the account's read mark below still keeps it */
    }
    void cloud.markNotificationsSeen(now).catch(() => {});
  };
  const toggle = () => {
    if (!open) {
      setOpenedSeen(seen);
      markSeen();
      load();
    }
    setOpen(!open);
  };
  return (
    <div
      className="admin-notifications"
      ref={root}
      onBlur={(event) => {
        // Tabbing out of the panel closes it, like any menu.
        const next = event.relatedTarget as Node | null;
        if (open && next && !root.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        className="admin-icon-button"
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span className="admin-badge-dot">{unread > 9 ? "9+" : unread}</span>
        )}
      </button>
      {open && (
        <div
          className="admin-notifications-panel"
          role="region"
          aria-label="Notifications"
        >
          <header>
            <strong>Notifications</strong>
          </header>
          {error ? (
            <p className="admin-notifications-empty">
              Couldn’t load notifications.{" "}
              <button className="commerce-link" onClick={load}>
                Try again
              </button>
            </p>
          ) : !notices ? (
            <p className="admin-notifications-empty">Loading…</p>
          ) : !notices.length ? (
            <p className="admin-notifications-empty">
              You’re all caught up. New orders, bookings, payments and
              publishing problems show up here.
            </p>
          ) : (
            <ul>
              {notices.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.href}
                    className={`${n.at > openedSeen ? "is-new" : ""} ${n.tone ? `is-${n.tone}` : ""}`}
                  >
                    <span className="admin-notice-icon">
                      <Icon name={n.icon} size={14} />
                    </span>
                    <span>
                      <strong>{n.title}</strong>
                      <small>{n.detail}</small>
                    </span>
                    <time dateTime={n.at}>{ago(n.at)}</time>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
