/**
 * Draws a block tree, the same markup in the editor and on the published
 * site. In the editor every block carries data-node-id (the canvas selects by
 * it) and text blocks edit in place.
 */
import type { CSSProperties } from "react";
import { Icon } from "../studio/Icon";
import { InlineText } from "../studio/InlineText";
import { pageHref, safeImage, type Page, type Project } from "../studio/model";
import { Ambient } from "../studio/siteParts";
import { SmartBlock } from "./smart";
import { BLOCKS } from "./registry";
import type { Node, PropValue } from "./model";
import { embedUrl, emphasis, lines, pairs } from "./text";
import { boundProps, type DataItem } from "./data/bind";
import { ChartBlock, RepeatBlock, StatBlock, TableBlock } from "./data/blocks";
import { FormBlock, type FormScope } from "./forms/FormBlocks";

export interface RenderContext {
  project: Project;
  /** Building the published files (links point at .html pages). */
  exporting: boolean;
  /** Turns an owner's link (/page, https://…, {owner}) into an href. */
  href: (url: string) => string;
  /** The page being shown, marked current in menus. */
  currentPage?: string;
  page?: Page;
  /** Published sites: where contact and signup forms post. */
  inbox?: string;
  /** Published sites: the public app API app forms talk to. */
  appApi?: string;
  /** Preview only: the theme switch. */
  dark?: boolean;
  /** Inside a repeat: the item its template is drawn for (bindings read it). */
  item?: DataItem;
  /** Inside a form block: its form, table and which step (src/blocks/forms). */
  form?: FormScope;
  onToggleTheme?: () => void;
  /** The Add panel's miniatures, drawn inside a button: nothing clickable. */
  miniature?: boolean;
  /** Set in the editor (not preview). */
  edit?: {
    selected: string | null;
    /** The block whose text is being typed into. */
    typing: string | null;
    onStartTyping: (id: string) => void;
    onFinishTyping: () => void;
    onCommit: (id: string, key: string, value: string) => void;
    onDraft?: (text: string) => void;
    onSelect: (id: string) => void;
  };
}

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
/** The built-in lightning mark (logo "bolt"). */
function Bolt() {
  return (
    <svg className="blk-logo-mark" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" />
      <path
        fill="currentColor"
        d="M22.4 8 13 22.1a.7.7 0 0 0 .58 1.1h5.2l-1.3 8.8 9.5-14.2a.7.7 0 0 0-.58-1.1h-5.2L22.4 8Z"
      />
    </svg>
  );
}

/**
 * What an unfinished block shows in the editor (never on the site): one look
 * for every "nothing here yet", saying what goes here and how to add it.
 */
export function Placeholder({
  icon,
  title,
  action,
  attrs,
  className = "",
  style,
  compact = false,
}: {
  icon: string;
  title: string;
  action: string;
  attrs?: Record<string, string | undefined>;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}) {
  return (
    <div
      {...attrs}
      className={`${className} blk-placeholder${compact ? " is-compact" : ""}`}
      style={style}
    >
      <span className="blk-placeholder-icon">
        <Icon name={icon} size={compact ? 15 : 18} />
      </span>
      <span className="blk-placeholder-text">
        <strong>{title}</strong>
        <span>{action}</span>
      </span>
    </div>
  );
}

export function Nodes({ nodes, ctx }: { nodes: Node[]; ctx: RenderContext }) {
  return (
    <>
      {nodes.map((n) =>
        // Hidden blocks are left out, in the editor too unless selected
        // (Layers lists them, so they can be found and shown again).
        n.hidden && ctx.edit?.selected !== n.id ? null : (
          <NodeView key={n.id} node={n} ctx={ctx} />
        ),
      )}
    </>
  );
}

export function NodeView({ node: n, ctx }: { node: Node; ctx: RenderContext }) {
  // Bound props (inside a repeat) come from the current item.
  const p = boundProps(n, ctx.item);
  const edit = ctx.edit;
  const tab = edit ? -1 : undefined;
  const variant = str(p.variant);
  const cls = (...extra: (string | false | undefined)[]) =>
    [
      "blk",
      `blk-${n.type}`,
      `n-${n.id}`,
      variant && `v-${variant}`,
      edit?.selected === n.id && "is-node-selected",
      n.hidden && "is-node-hidden",
      ...extra,
    ]
      .filter(Boolean)
      .join(" ");
  const attrs = edit ? { "data-node-id": n.id, "data-node-type": n.type } : {};
  const kids = n.children ?? [];
  const children =
    kids.length || !edit ? (
      <Nodes nodes={kids} ctx={ctx} />
    ) : (
      <Placeholder
        icon="plus"
        title={`Empty ${BLOCKS[n.type].label.toLowerCase()}`}
        action="Drag blocks here, or select it and use Add."
        className="blk-empty"
        attrs={{ "data-drop-hint": "" }}
        compact
      />
    );
  /** Text the owner can double-click to type into. */
  const typed = (
    key: string,
    as: "span" | "div" | "h1" | "h2" | "h3" | "h4" | "p",
    className: string,
    extra: Record<string, unknown> = {},
  ) => {
    const value = str(p[key]);
    // Text filled from data isn't typed into (it changes with the item).
    const bound = !!(ctx.item && n.bind?.[key]);
    if (!edit || bound) {
      const Tag = as;
      // "{year}" shows the current year (copyright lines).
      const shown = value.replaceAll(
        "{year}",
        String(new Date().getFullYear()),
      );
      return (
        <Tag className={className} {...(bound ? attrs : {})} {...extra}>
          {n.type === "heading" ? emphasis(shown) : shown}
        </Tag>
      );
    }
    return (
      <InlineText
        as={as}
        value={value}
        className={className}
        enabled
        editing={edit.typing === n.id}
        label={`Edit ${BLOCKS[n.type].label.toLowerCase()} text`}
        onCommit={(v) => edit.onCommit(n.id, key, v)}
        onActivate={() => edit.onSelect(n.id)}
        onStartEdit={() => edit.onStartTyping(n.id)}
        onFinishEdit={edit.onFinishTyping}
        onDraft={edit.onDraft}
        attrs={{ ...attrs, ...extra }}
        render={n.type === "heading" ? emphasis : undefined}
      />
    );
  };
  const link = (url: string) => ({
    href: ctx.href(url),
    tabIndex: tab,
  });

  switch (n.type) {
    case "section": {
      const Tag = (
        ["header", "footer"].includes(str(p.tag)) ? str(p.tag) : "section"
      ) as "section";
      const tone = str(p.tone);
      const look = str(p.look);
      const orbits = str(p.effect) === "orbits";
      return (
        <Tag
          {...attrs}
          className={cls(
            p.sticky === true && "is-sticky",
            ["soft", "accent", "dark"].includes(tone) && `tone-${tone}`,
            look && /^[a-z-]+$/.test(look) && `lk lk-${look}`,
            orbits && "has-orbits",
          )}
          style={
            typeof p.shade === "number"
              ? ({
                  "--shade": Math.max(0, Math.min(100, p.shade)) / 100,
                } as CSSProperties)
              : undefined
          }
        >
          {orbits && <Ambient />}
          <div className="blk-inner">{children}</div>
        </Tag>
      );
    }
    case "box": {
      const href = str(p.link);
      if (href && !edit)
        return (
          <a {...link(href)} className={cls()}>
            {children}
          </a>
        );
      return (
        <div {...attrs} className={cls()}>
          {children}
        </div>
      );
    }
    case "row":
    case "columns":
    case "column":
    case "grid":
    case "products":
      return (
        <div
          {...attrs}
          className={cls(
            n.type === "columns" && p.reverse === true && "is-reversed",
          )}
        >
          {children}
        </div>
      );
    case "tabBar":
    case "contactForm":
    case "newsletter":
    case "appForm":
    case "collectionList":
      return <SmartBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "repeat":
      return <RepeatBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "stat":
      return <StatBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "chart":
      return <ChartBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "table":
      return <TableBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "form":
    case "field":
    case "submit":
    case "formStep":
    case "formSuccess":
    case "formError":
    case "formSteps":
    case "formRecord":
      return <FormBlock node={n} ctx={ctx} className={cls()} attrs={attrs} />;
    case "heading": {
      const level = ["1", "2", "3", "4"].includes(str(p.level))
        ? str(p.level)
        : "2";
      return typed("text", `h${level}` as "h2", cls(`lvl-${level}`));
    }
    case "text":
      return typed("text", "p", cls());
    case "badge":
      return (
        <span {...attrs} className={cls()}>
          {str(p.icon) && <Icon name={str(p.icon)} size={14} />}
          {edit ? typed("text", "span", "blk-badge-text") : str(p.text)}
        </span>
      );
    case "button": {
      const v = ["primary", "secondary", "ghost", "link"].includes(variant)
        ? variant
        : "primary";
      const icon = str(p.icon) || (v === "link" ? "arrow" : "");
      return (
        <a
          {...attrs}
          {...link(str(p.url))}
          className={cls(`s-${str(p.size) || "md"}`)}
          {...(p.newTab === true && !edit
            ? { target: "_blank", rel: "noopener" }
            : {})}
        >
          {str(p.iconStart) && <Icon name={str(p.iconStart)} size={16} />}
          {edit ? typed("label", "span", "blk-button-label") : str(p.label)}
          {icon && <Icon name={icon} size={16} />}
        </a>
      );
    }
    case "image": {
      const src = safeImage(str(p.src));
      const ratio = str(p.ratio);
      const style = {
        aspectRatio: ratio && ratio !== "auto" ? ratio : undefined,
        objectFit: str(p.fit) === "contain" ? "contain" : "cover",
      } as CSSProperties;
      // A set address that can't be shown keeps its frame and link (as the
      // classic cards did); an empty one shows nothing on the site.
      if (!src && (edit || !str(p.src)))
        return edit ? (
          <Placeholder
            icon="image"
            title="Image"
            action="Choose a photo in the panel on the right."
            attrs={attrs}
            className={cls("blk-image-empty")}
            style={style}
          />
        ) : null;
      const img = (
        <img
          {...(str(p.link) ? {} : attrs)}
          className={cls()}
          src={src || undefined}
          alt={str(p.alt)}
          loading="lazy"
          style={style}
        />
      );
      return str(p.link) ? (
        <a {...attrs} {...link(str(p.link))} className="blk-image-link">
          {img}
        </a>
      ) : (
        img
      );
    }
    case "icon": {
      const size = typeof p.size === "number" ? p.size : 22;
      return (
        <span
          {...attrs}
          className={cls()}
          style={{ "--icon-size": `${size}px` } as CSSProperties}
        >
          <Icon name={str(p.icon) || "sparkles"} size={size} />
        </span>
      );
    }
    case "list": {
      const marker = str(p.marker);
      const Tag = marker === "number" ? "ol" : "ul";
      return (
        <Tag {...attrs} className={cls(`m-${marker || "check"}`)}>
          {lines(p.items).map((item, i) => (
            <li key={i}>
              {marker === "check" || !marker ? (
                <Icon name="check" size={16} className="blk-list-check" />
              ) : null}
              <span>{item}</span>
            </li>
          ))}
        </Tag>
      );
    }
    case "divider":
      return <hr {...attrs} className={cls()} />;
    case "spacer":
      return <div {...attrs} className={cls()} aria-hidden="true" />;
    case "video": {
      const src = embedUrl(str(p.url));
      if (!src)
        return edit ? (
          <Placeholder
            icon="eye"
            title="Video"
            action="Paste a YouTube or Vimeo link in the panel on the right."
            attrs={attrs}
            className={cls("blk-media-empty")}
          />
        ) : null;
      return (
        <div {...attrs} className={cls()}>
          <iframe
            src={src}
            title={str(p.title) || "Video"}
            loading="lazy"
            allow="accelerometer; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            tabIndex={tab}
          />
        </div>
      );
    }
    case "map": {
      const address = str(p.address).trim();
      if (!address)
        return edit ? (
          <Placeholder
            icon="globe"
            title="Map"
            action="Type your address in the panel on the right."
            attrs={attrs}
            className={cls("blk-media-empty")}
          />
        ) : null;
      const zoom = typeof p.zoom === "number" ? p.zoom : 15;
      return (
        <div {...attrs} className={cls()}>
          <iframe
            src={`https://www.google.com/maps?q=${encodeURIComponent(address)}&z=${zoom}&output=embed`}
            title={`Map of ${address}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            tabIndex={tab}
          />
        </div>
      );
    }
    case "logo": {
      const name = str(p.text) || ctx.project.name;
      // Without its own image a logo shows the site's logo mark (Site styles).
      const own = str(p.image) === "https://" ? "" : str(p.image);
      const theme =
        ctx.project.theme.logo === "https://" ? "" : ctx.project.theme.logo;
      const image = p.mark === false ? "" : own || theme || "";
      const src = image && image !== "bolt" ? safeImage(image) : "";
      return (
        <a
          {...attrs}
          href={ctx.exporting ? "index.html" : "/"}
          tabIndex={tab}
          className={cls(str(p.tagline) && "has-tagline")}
        >
          {image === "bolt" ? (
            <Bolt />
          ) : src ? (
            <img className="blk-logo-mark" src={src} alt="" />
          ) : null}
          <span className="blk-logo-words">
            <span className="blk-logo-name">
              {name}
              {p.dot !== false &&
                ctx.project.theme.brandDot !== false &&
                !str(p.tagline) && <span className="blk-logo-dot">.</span>}
            </span>
            {str(p.tagline) && (
              <span className="blk-logo-tagline">{str(p.tagline)}</span>
            )}
          </span>
        </a>
      );
    }
    case "menu": {
      const items =
        str(p.source) === "custom"
          ? pairs(p.links).map(([label, url]) => ({
              key: label + url,
              label,
              href: ctx.href(url || "/"),
              current: false,
            }))
          : ctx.project.pages.map((page) => ({
              key: page.id,
              label: page.name,
              href: ctx.exporting ? pageHref(page.slug) : `/${page.slug}`,
              current: page.id === ctx.currentPage,
            }));
      const anchors = items.map((i) => (
        <a
          key={i.key}
          href={i.href}
          tabIndex={tab}
          aria-current={i.current ? "page" : undefined}
        >
          {i.label}
        </a>
      ));
      // Inline and stacked links never fold into a menu button (footers).
      if (variant === "inline" || variant === "stack")
        return (
          <nav {...attrs} aria-label="Site links" className={cls()}>
            <span className="blk-menu-links">{anchors}</span>
          </nav>
        );
      return (
        <div {...attrs} className={cls()}>
          <nav aria-label="Main navigation" className="blk-menu-links">
            {anchors}
          </nav>
          <details className="blk-menu-phone">
            <summary tabIndex={tab} aria-label="Open navigation">
              <Icon name="menu" />
            </summary>
            <nav aria-label="Main navigation">{anchors}</nav>
          </details>
        </div>
      );
    }
    case "themeToggle":
      // Without dark mode the switch has nothing to do; it shows a hint only
      // while selected (from Layers), so headers don't carry a stray note.
      if (!ctx.project.theme.darkToggle)
        return edit?.selected === n.id ? (
          <span {...attrs} className={cls("blk-hint")}>
            Turn on “Light and dark” in Site styles
          </span>
        ) : null;
      if (ctx.miniature)
        return (
          <span {...attrs} className={cls("site-theme-toggle")}>
            <Icon name="rw:moon" className="site-theme-moon" />
          </span>
        );
      return (
        <button
          {...attrs}
          type="button"
          className={cls("site-theme-toggle")}
          data-site-theme-toggle=""
          tabIndex={tab}
          aria-label={
            ctx.dark ? "Switch to light theme" : "Switch to dark theme"
          }
          aria-pressed={ctx.dark}
          onClick={edit ? undefined : ctx.onToggleTheme}
        >
          <Icon name="rw:moon" className="site-theme-moon" />
          <Icon name="rw:sun" className="site-theme-sun" />
        </button>
      );
    case "accordion":
      return (
        <div {...attrs} className={cls()}>
          {pairs(p.items).map(([q, a], i) => (
            <details key={i}>
              <summary tabIndex={tab}>
                <span>{q}</span>
                <Icon name="plus" size={16} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      );
    case "social":
      return (
        <div {...attrs} className={cls()}>
          {pairs(p.links)
            .filter(([, url]) => url)
            .map(([label, url], i) => (
              <a
                key={i}
                href={ctx.href(url)}
                tabIndex={tab}
                target="_blank"
                rel="noopener"
              >
                {label}
              </a>
            ))}
        </div>
      );
  }
}
