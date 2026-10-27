import {
  Fragment,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { InlineText, type TextField, type TextEditTarget } from "./InlineText";
import { Icon } from "./Icon";
import {
  safeImage,
  safeUrl,
  pageHref,
  sectionMeta,
  OWNER_LINK,
  type Block,
  type Section,
  type Project,
  type Page,
} from "./model";
import { responsiveCss } from "./responsive";
import {
  formatValue,
  itemTitle,
  type Collection,
  type CollectionItem,
} from "./collections";
import {
  REQUEST_FIELDS,
  REQUEST_KINDS,
  requestButton,
  type CollectionRequest,
} from "./requests";
import { canCollect, usablePayments, type PaymentSettings } from "./payments";
import {
  AppFormArea,
  CollectionCards,
  SiteForm,
  TabBar,
  Ambient,
} from "./siteParts";
import { appSectionProblem } from "../apps/issues";
import { sectionCollections, tabBarOf } from "../blocks/project";
import { Nodes, type RenderContext } from "../blocks/render";
import { treeCss } from "../blocks/style";
import {
  NO_PREVIEW,
  usePageLogic,
  type LogicContext,
  type PreviewAs,
} from "../blocks/logic/blocks";
import "./website.css";
import "../blocks/blocks.css";
import "../blocks/looks.css";
import "../blocks/forms/forms.css";

function resolveHref(
  url: string,
  project: Project,
  exporting: boolean,
  /** Where OWNER_LINK goes: the owner's app for this site, or nowhere yet. */
  owner?: string,
) {
  if (url.trim() === OWNER_LINK) return owner || "#";
  const safe = safeUrl(url);
  const page = project.pages.find((p) => `/${p.slug}` === safe);
  return exporting && page ? pageHref(page.slug) : safe;
}
/** The body of an item's own page: everything known about it, plus its call to action. */
/**
 * The visitor action form. Published sites post straight to the Forma inbox
 * (no script needed); in the editor it is a working mock that never sends.
 */
function RequestForm({
  collection: c,
  item,
  request,
  inbox,
  payments,
}: {
  collection: Collection;
  item: CollectionItem;
  request: CollectionRequest;
  inbox?: string;
  payments?: PaymentSettings;
}) {
  const [tried, setTried] = useState(false);
  const spec = REQUEST_KINDS[request.kind];
  const usable =
    request.collect && canCollect(request.kind)
      ? usablePayments(payments)
      : null;
  const methods = usable
    ? [
        usable.upi && "UPI",
        usable.bank && "bank transfer",
        usable.online && "card",
        usable.link && "online",
        usable.inPerson && "in person",
      ].filter(Boolean)
    : [];
  const id = (name: string) => `request-${item.id}-${name}`;
  return (
    <form
      className="site-request"
      method="post"
      action={inbox}
      onSubmit={
        inbox
          ? undefined
          : (e) => {
              e.preventDefault();
              setTried(true);
            }
      }
    >
      <h2>{requestButton(request)}</h2>
      <input type="hidden" name="collection" value={c.id} />
      <input type="hidden" name="item" value={item.slug} />
      <label className="site-request-trap" aria-hidden="true">
        Leave empty
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="site-request-row">
        <label htmlFor={id("name")}>
          <span>Name</span>
          <input
            id={id("name")}
            name="name"
            autoComplete="name"
            required
            maxLength={100}
          />
        </label>
        <label htmlFor={id("email")}>
          <span>Email</span>
          <input
            id={id("email")}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
      </div>
      <div className="site-request-row">
        {spec.fields.map((f) => {
          const field = REQUEST_FIELDS[f];
          const required = spec.required.includes(f);
          const props = {
            id: id(f),
            name: f,
            required,
          };
          return (
            <label
              key={f}
              htmlFor={id(f)}
              className={
                field.input === "textarea" ? "site-request-wide" : undefined
              }
            >
              <span>
                {field.label}
                {!required && <small> (optional)</small>}
              </span>
              {field.input === "textarea" ? (
                <textarea {...props} rows={3} maxLength={3000} />
              ) : (
                <input
                  {...props}
                  type={field.input}
                  min={field.min}
                  max={field.max}
                  defaultValue={
                    field.input === "number" && required ? "1" : undefined
                  }
                />
              )}
            </label>
          );
        })}
      </div>
      <button className="site-button" type="submit">
        {requestButton(request)}
        <Icon name="arrow" size={16} />
      </button>
      {usable && (
        <small className="site-request-pay">
          <Icon name="lock" size={13} />
          Next you’ll see the total and how to pay:{" "}
          {methods.join(", ").replace(/, ([^,]*)$/, " or $1")}.
        </small>
      )}
      {tried && (
        <small className="site-request-note" role="status">
          This is a preview. Once published with Forma, requests arrive in your
          Inbox.
        </small>
      )}
    </form>
  );
}

export function ItemDetail({
  collection: c,
  item,
  exporting,
  project,
  inbox,
}: {
  collection: Collection;
  item: CollectionItem;
  exporting: boolean;
  project: Project;
  /** Where the visitor action form posts; static exports without one omit it. */
  inbox?: string;
}) {
  const request = c.request && (inbox || !exporting) ? c.request : undefined;
  const d = c.display;
  const v = (field: string) => (field ? (item.values[field] ?? "") : "");
  const image = safeImage(v(d.image));
  const shown = new Set([
    d.title,
    d.image,
    d.price,
    d.subtitle,
    d.body,
    d.action,
    d.summary,
  ]);
  const details = c.fields.filter(
    (f) => !shown.has(f.id) && f.type !== "image" && v(f.id),
  );
  const href = (url: string) => resolveHref(url, project, exporting);
  // "Back" goes to the page that lists this collection, or home.
  const listedOn =
    project.pages.find((p) =>
      p.sections.some((x) => !x.hidden && sectionCollections(x).includes(c.id)),
    ) ?? project.pages[0];
  return (
    <section className={`site-item ${image ? "" : "site-item-no-image"}`}>
      {image && (
        <img className="site-item-image" src={image} alt={itemTitle(c, item)} />
      )}
      <div className="site-item-copy">
        <a
          className="site-item-back"
          href={exporting ? pageHref(listedOn.slug) : `/${listedOn.slug}`}
        >
          {c.name}
        </a>
        <h1>{itemTitle(c, item)}</h1>
        {v(d.subtitle) && (
          <span className="site-listing-meta">
            {formatValue(c, d.subtitle, v(d.subtitle))}
          </span>
        )}
        {v(d.price) && (
          <span className="site-item-price">
            {formatValue(c, d.price, v(d.price))}
          </span>
        )}
        {(v(d.body) || v(d.summary)) && (
          <p className="site-item-body">{v(d.body) || v(d.summary)}</p>
        )}
        {details.length > 0 && (
          <dl className="site-item-details">
            {details.map((f) => (
              <div key={f.id}>
                <dt>{f.name}</dt>
                <dd>
                  {f.type === "link" ? (
                    <a href={href(v(f.id))}>{v(f.id)}</a>
                  ) : (
                    formatValue(c, f.id, v(f.id))
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {v(d.action) &&
          d.actionLabel &&
          // The form already offers this action; don't repeat it as a link.
          !(
            request &&
            d.actionLabel.trim().toLowerCase() ===
              requestButton(request).trim().toLowerCase()
          ) && (
            <a
              className={`site-button${request ? " site-button-quiet" : ""}`}
              href={href(v(d.action))}
            >
              {d.actionLabel}
              <Icon name="arrowUpRight" size={16} />
            </a>
          )}
        {request && (
          <RequestForm
            collection={c}
            item={item}
            request={request}
            inbox={inbox}
            payments={project.payments}
          />
        )}
      </div>
    </section>
  );
}

function Blocks({
  blocks,
  href,
  editing,
  selectedBlock,
}: {
  blocks: Block[];
  href: (url: string) => string;
  editing: boolean;
  selectedBlock?: string | null;
}) {
  return (
    <>
      {blocks.map((b) => {
        const props = {
          ...(editing
            ? {
                "data-block-id": b.id,
                "data-block-type": b.type,
              }
            : {}),
        };
        const cls = (name: string) =>
          `site-block ${name}${editing && selectedBlock === b.id ? " is-block-selected" : ""}`;
        switch (b.type) {
          case "heading": {
            const Tag = b.size === "lg" || b.size === "xl" ? "h2" : "h3";
            return (
              <Tag
                key={b.id}
                {...props}
                className={cls(`site-heading size-${b.size}`)}
              >
                {b.text}
              </Tag>
            );
          }
          case "text":
            return (
              <p
                key={b.id}
                {...props}
                className={cls(`site-text size-${b.size}`)}
              >
                {b.text}
              </p>
            );
          case "button":
            return (
              <div key={b.id} {...props} className={cls("site-block-button")}>
                <a
                  tabIndex={editing ? -1 : undefined}
                  className={
                    b.variant === "link"
                      ? "site-text-link"
                      : `site-button${b.variant === "secondary" ? " site-button-secondary" : ""}`
                  }
                  href={href(b.url)}
                >
                  {b.text}
                  <Icon
                    name={b.variant === "link" ? "arrow" : "arrowUpRight"}
                    size={16}
                  />
                </a>
              </div>
            );
          case "image": {
            const src = safeImage(b.image);
            if (!src)
              return editing ? (
                <div
                  key={b.id}
                  {...props}
                  className={cls("site-image-placeholder")}
                >
                  <Icon name="image" size={28} />
                </div>
              ) : null;
            return (
              <img
                key={b.id}
                {...props}
                className={cls("site-block-image")}
                src={src}
                alt={b.alt}
                loading="lazy"
                style={b.height ? { height: b.height } : undefined}
              />
            );
          }
          case "spacer":
            return (
              <div
                key={b.id}
                {...props}
                className={cls("site-spacer")}
                style={{ height: b.height }}
                aria-hidden="true"
              />
            );
          case "divider":
            return <hr key={b.id} {...props} className={cls("site-divider")} />;
          case "columns":
            return (
              <div
                key={b.id}
                {...props}
                className={cls("site-columns")}
                style={{ "--columns": b.children.length } as CSSProperties}
              >
                <Blocks
                  blocks={b.children}
                  href={href}
                  editing={editing}
                  selectedBlock={selectedBlock}
                />
              </div>
            );
          case "column":
            return (
              <div key={b.id} {...props} className={cls("site-column")}>
                <Blocks
                  blocks={b.children}
                  href={href}
                  editing={editing}
                  selectedBlock={selectedBlock}
                />
              </div>
            );
        }
      })}
    </>
  );
}

/** Text wrapped in *asterisks* is shown in the accent colour (hero headings). */
function emphasis(value: string): ReactNode[] {
  return value
    .split(/\*([^*\n]+)\*/)
    .map((part, n) => (n % 2 ? <em key={n}>{part}</em> : part));
}
const hasEmphasis = (value: string) => /\*[^*\n]+\*/.test(value);

/** The reference's lightning mark: a fine ring around a bolt, in the accent colour. */
function BrandMark({ logo }: { logo?: string }) {
  if (logo === "bolt")
    return (
      <svg
        className="site-brand-mark"
        viewBox="0 0 40 40"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="20" cy="20" r="19" fill="none" stroke="currentColor" />
        <path
          fill="currentColor"
          d="M22.4 8 13 22.1a.7.7 0 0 0 .58 1.1h5.2l-1.3 8.8 9.5-14.2a.7.7 0 0 0-.58-1.1h-5.2L22.4 8Z"
        />
      </svg>
    );
  // "https://" alone is the Logo mark switch waiting for an address.
  const src = logo && logo !== "https://" ? safeImage(logo) : "";
  return src ? <img className="site-brand-mark" src={src} alt="" /> : null;
}

export function SectionContent({
  section: s,
  project,
  exporting = false,
  onEdit,
  onActivate,
  editingField,
  onStartEdit,
  onFinishEdit,
  onDraft,
  selectedBlock,
  main = false,
  inbox,
  appApi,
  ownerHref,
  currentPage,
  dark,
  onToggleTheme,
  blockEdit,
  logic,
}: {
  section: Section;
  project: Project;
  exporting?: boolean;
  /** The page's values, "Preview as" and open dialog (src/blocks/logic). */
  logic?: LogicContext;
  /** Editor only: selecting and typing into a "blocks" section's blocks. */
  blockEdit?: RenderContext["edit"];
  /** Where links to OWNER_LINK go (the owner's app for this site). */
  ownerHref?: string;
  /** The page being shown, marked as current in a "brand" header. */
  currentPage?: string;
  /** The visitor's light/dark choice, once made (undefined follows the device). */
  dark?: boolean;
  /** Preview only: the header's light/dark switch. */
  onToggleTheme?: () => void;
  /** Published sites: Contact and Email signup forms post here unless they have their own endpoint. */
  inbox?: string;
  /** Published sites: the public app API app forms talk to, e.g. https://api…/apps/<site id>. */
  appApi?: string;
  /** This section's title is the page's main heading (pages without a hero). */
  main?: boolean;
  selectedBlock?: string | null;
  onEdit?: (
    field: "title" | "body" | "eyebrow" | "buttonLabel",
    value: string,
  ) => void;
  onActivate?: (field: TextField) => void;
  editingField?: TextField;
  onStartEdit?: (field: TextField) => void;
  onFinishEdit?: () => void;
  onDraft?: (text: string) => void;
}) {
  const text = (
    field: "title" | "body" | "eyebrow" | "buttonLabel",
    as: "span" | "div" | "h1" | "h2" | "p" = "span",
    className?: string,
  ) => (
    <InlineText
      as={as}
      value={s[field]}
      className={className}
      enabled={!!onEdit}
      label={`Edit ${s.name} ${field === "title" ? "heading" : field === "body" ? "description" : field}`}
      onCommit={(value) => onEdit?.(field, value)}
      editing={editingField === field}
      onActivate={() => onActivate?.(field)}
      onStartEdit={() => onStartEdit?.(field)}
      onFinishEdit={onFinishEdit}
      onDraft={onDraft}
    />
  );
  const href = (url: string) => resolveHref(url, project, exporting, ownerHref);
  const heading = (
    <>
      {s.eyebrow && text("eyebrow", "div", "site-eyebrow")}
      {s.title &&
        (main ? text("title", "h1", "site-title-main") : text("title", "h2"))}
      {s.body && text("body", "p", "site-description")}
    </>
  );
  const button = s.buttonLabel && (
    <a
      tabIndex={onEdit ? -1 : undefined}
      className="site-button"
      href={href(s.buttonUrl)}
    >
      {text("buttonLabel")}
      <Icon name="arrowUpRight" size={16} />
    </a>
  );
  const pages = project.pages.map((p) => (
    <a
      tabIndex={onEdit ? -1 : undefined}
      key={p.id}
      href={exporting ? pageHref(p.slug) : `/${p.slug}`}
    >
      {p.name}
    </a>
  ));
  const tab = onEdit ? -1 : undefined;
  const themeToggle = project.theme.darkToggle && (
    <button
      type="button"
      className="site-theme-toggle"
      data-site-theme-toggle=""
      tabIndex={tab}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark === undefined ? undefined : dark}
      onClick={onToggleTheme}
    >
      <Icon name="rw:moon" className="site-theme-moon" />
      <Icon name="rw:sun" className="site-theme-sun" />
    </button>
  );
  // Hero headings show *emphasis* in the accent colour. While editing, the
  // heading shows the styled text until it's double-clicked, then the raw text.
  const heroTitle = () => {
    if (!hasEmphasis(s.title) || (onEdit && editingField === "title"))
      return text("title", "h1");
    if (!onEdit) return <h1>{emphasis(s.title)}</h1>;
    const label = `Edit ${s.name} heading`;
    return (
      <h1
        className="inline-copy"
        role="button"
        tabIndex={0}
        aria-label={label}
        data-edit-field={label}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onActivate?.("title");
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onStartEdit?.("title");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "F2") {
            e.preventDefault();
            e.stopPropagation();
            onStartEdit?.("title");
          }
        }}
      >
        {emphasis(s.title)}
      </h1>
    );
  };
  const image = safeImage(s.image);
  const style: CSSProperties = {
    backgroundColor: s.background || undefined,
    color: s.color || undefined,
    textAlign: s.align,
    paddingBlock: `calc(${s.padding}px * var(--site-space, 1))`,
    "--section-height": `${s.height}px`,
  } as CSSProperties;
  const content = (() => {
    switch (s.type) {
      case "announcement":
        return (
          <a
            tabIndex={onEdit ? -1 : undefined}
            className="site-announcement"
            style={style}
            href={href(s.buttonUrl)}
          >
            {text("title")}
          </a>
        );
      case "header":
        if (s.variant === "brand")
          return (
            <header className="site-header site-header-brand" style={style}>
              <a
                tabIndex={tab}
                className="site-brand site-brand-lockup"
                href={exporting ? "index.html" : "/"}
              >
                <BrandMark logo={project.theme.logo} />
                <span className="site-brand-words">
                  {text("title", "span", "site-brand-name")}
                  {s.eyebrow && text("eyebrow", "span", "site-brand-tagline")}
                </span>
              </a>
              <nav aria-label="Main navigation" className="site-brand-nav">
                {project.pages.map((p) => (
                  <a
                    tabIndex={tab}
                    key={p.id}
                    href={exporting ? pageHref(p.slug) : `/${p.slug}`}
                    aria-current={p.id === currentPage ? "page" : undefined}
                  >
                    {p.name}
                  </a>
                ))}
              </nav>
              {s.buttonLabel && (
                <a
                  tabIndex={tab}
                  className="site-header-cta"
                  href={href(s.buttonUrl)}
                >
                  {s.buttonLabel}
                </a>
              )}
              {themeToggle}
            </header>
          );
        return (
          <header className="site-header" style={style}>
            <a
              tabIndex={onEdit ? -1 : undefined}
              className="site-brand"
              href={exporting ? "index.html" : "/"}
            >
              {project.theme.logo && <BrandMark logo={project.theme.logo} />}
              {text("title")}
              {project.theme.brandDot !== false && (
                <span className="site-brand-dot">.</span>
              )}
            </a>
            <nav aria-label="Main navigation">{pages}</nav>
            {s.buttonLabel && (
              <a
                tabIndex={onEdit ? -1 : undefined}
                className="site-header-cta"
                href={href(s.buttonUrl)}
              >
                {s.buttonLabel}
                <Icon name="arrowUpRight" size={15} />
              </a>
            )}
            <details className="site-mobile-menu">
              <summary
                tabIndex={onEdit ? -1 : undefined}
                aria-label="Open navigation"
              >
                <Icon name="menu" />
              </summary>
              <nav>{pages}</nav>
            </details>
            {themeToggle}
          </header>
        );
      case "hero": {
        const orbits = s.effect === "orbits";
        const secondary = s.secondaryLabel && (
          <a
            tabIndex={tab}
            className={
              s.variant === "badge"
                ? "site-hero-ghost"
                : "site-button site-button-secondary site-hero-secondary"
            }
            href={href(s.secondaryUrl ?? "")}
          >
            {s.variant === "badge" && s.items[1]?.icon && (
              <Icon name={`rw:${s.items[1].icon}`} size={16} />
            )}
            {s.secondaryLabel}
          </a>
        );
        const note = s.note && <p className="site-hero-reassure">{s.note}</p>;
        if (s.variant === "badge")
          return (
            <section
              className={`site-hero site-hero-badge${orbits ? " site-hero-orbits" : ""}`}
              style={style}
            >
              {orbits && <Ambient />}
              <div className="site-hero-copy">
                {s.eyebrow && (
                  <p className="site-hero-pill">
                    <Icon name="rw:bolt" size={14} />
                    {text("eyebrow")}
                  </p>
                )}
                {heroTitle()}
                {s.body && text("body", "p", "site-hero-lead")}
                {(s.buttonLabel || secondary) && (
                  <div className="site-hero-actions">
                    {s.buttonLabel && (
                      <a
                        tabIndex={tab}
                        className="site-hero-cta"
                        href={href(s.buttonUrl)}
                      >
                        {s.items[0]?.icon && (
                          <Icon name={`rw:${s.items[0].icon}`} size={18} />
                        )}
                        {text("buttonLabel")}
                        <Icon
                          name="rw:arrow"
                          size={18}
                          className="site-hero-cta-arrow"
                        />
                      </a>
                    )}
                    {secondary}
                  </div>
                )}
                {note}
              </div>
            </section>
          );
        return (
          <section
            className={`site-hero ${s.layout === "split" ? "site-hero-split" : ""} ${image ? "" : "site-hero-plain"} ${s.align === "center" ? "site-hero-center" : ""}${orbits ? " site-hero-orbits" : ""}`}
            style={style}
          >
            {orbits && <Ambient />}
            {image && (
              <img className="site-hero-image" src={image} alt={s.imageAlt} />
            )}
            <div
              className="site-hero-shade"
              style={{ opacity: s.overlay / 100 }}
            />
            <div className="site-hero-copy">
              {text("eyebrow", "div", "site-eyebrow")}
              {heroTitle()}
              {text("body", "p")}
              {button}
              {secondary}
              {note}
            </div>
            <span className="site-hero-note">{project.name.toUpperCase()}</span>
          </section>
        );
      }
      case "features":
        if (s.variant === "cards")
          return (
            <section
              className="site-features site-features-cards"
              style={style}
            >
              <div className="site-variant-inner">
                {s.title && text("title", "h2", "site-steps-title")}
                <ol className="site-steps">
                  {s.items.map((i, n) => (
                    <li className="site-step" key={i.id}>
                      <span className="site-step-icon" aria-hidden="true">
                        <Icon
                          name={`rw:${i.icon ?? ["phone", "receipt", "bell", "wallet"][n % 4]}`}
                          size={18}
                        />
                      </span>
                      <p className="site-step-heading">
                        <span className="site-step-number">{n + 1}</span>
                        {i.title}
                      </p>
                      <p className="site-step-body">{i.body}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          );
        return (
          <section
            className={`site-features ${s.title ? "has-heading" : ""}`}
            style={style}
          >
            {s.title && (
              <header className="site-features-heading">
                {text("eyebrow", "div", "site-eyebrow")}
                {text("title", "h2")}
              </header>
            )}
            {s.items.map((i, n) => (
              <div key={i.id}>
                <Icon
                  name={i.icon ?? ["leaf", "truck", "heart"][n % 3]}
                  size={25}
                />
                <div>
                  <h3>{i.title}</h3>
                  <p>{i.body}</p>
                </div>
              </div>
            ))}
          </section>
        );
      case "products":
      case "gallery":
        return (
          <section
            className={`site-collection ${s.type === "gallery" ? "site-gallery" : ""}`}
            style={style}
          >
            <div className="site-section-heading">
              <div>{heading}</div>
              {s.buttonLabel && (
                <a
                  tabIndex={onEdit ? -1 : undefined}
                  className="site-text-link"
                  href={href(s.buttonUrl)}
                >
                  {s.buttonLabel}
                  <Icon name="arrow" size={16} />
                </a>
              )}
            </div>
            <div className="site-cards">
              {s.items.map((i) => (
                <article className="site-product" key={i.id}>
                  {i.url ? (
                    <a
                      tabIndex={onEdit ? -1 : undefined}
                      href={href(i.url)}
                      className="site-product-image"
                    >
                      <img
                        src={safeImage(i.image)}
                        alt={i.title}
                        loading="lazy"
                      />
                      <span className="site-card-arrow">
                        <Icon name="arrowUpRight" />
                      </span>
                    </a>
                  ) : (
                    <div className="site-product-image">
                      {i.image ? (
                        <img
                          src={safeImage(i.image)}
                          alt={i.title}
                          loading="lazy"
                        />
                      ) : (
                        <Icon name="image" size={32} />
                      )}
                    </div>
                  )}
                  <div className="site-product-title">
                    <h3>{i.title}</h3>
                    {s.type === "products" && <span>{i.price}</span>}
                  </div>
                  <p>{i.body}</p>
                </article>
              ))}
            </div>
          </section>
        );
      case "imageText":
        return (
          <section
            className={`site-image-text ${s.layout === "split" ? "site-image-right" : ""}`}
            style={style}
          >
            {image && <img src={image} alt={s.imageAlt} loading="lazy" />}
            <div>
              {heading}
              {button}
            </div>
          </section>
        );
      case "testimonials":
        return (
          <section className="site-testimonials" style={style}>
            <div className="site-section-heading">
              {" "}
              <div>{heading}</div>
            </div>
            <div className="site-cards">
              {s.items.map((i) => (
                <blockquote key={i.id}>
                  <div className="site-stars" aria-label="5 out of 5 stars">
                    ★★★★★
                  </div>
                  <p>{i.body}</p>
                  <cite>{i.title}</cite>
                </blockquote>
              ))}
            </div>
          </section>
        );
      case "faq":
        return (
          <section className="site-faq" style={style}>
            <div>{heading}</div>
            <div>
              {s.items.map((i) => (
                <details key={i.id}>
                  <summary tabIndex={onEdit ? -1 : undefined}>
                    {i.title}
                    <Icon name="plus" size={16} />
                  </summary>
                  <p>{i.body}</p>
                </details>
              ))}
            </div>
          </section>
        );
      case "contact":
      case "newsletter":
        return (
          <section
            className={`site-form-section ${s.type === "contact" ? "site-contact" : ""}`}
            style={style}
          >
            <div>{heading}</div>
            <SiteForm
              kind={s.type}
              buttonLabel={s.buttonLabel}
              formAction={s.formAction}
              inbox={inbox}
              editing={!!onEdit}
              exporting={exporting}
            />
          </section>
        );
      case "collection": {
        const c = project.collections?.find(
          (x) => x.id === s.listing?.collection,
        );
        return (
          <section className="site-collection-section" style={style}>
            {(s.eyebrow || s.title || s.body) && (
              <div className="site-section-heading">
                <div>{heading}</div>
              </div>
            )}
            {c && s.listing ? (
              <CollectionCards
                collection={c}
                listing={s.listing}
                exporting={exporting}
                editing={!!onEdit}
                href={href}
              />
            ) : (
              onEdit && (
                <p className="site-listing-empty">
                  Choose a collection to show here.
                </p>
              )
            )}
          </section>
        );
      }
      case "app": {
        const area = (
          <AppFormArea
            project={project}
            formId={s.appForm}
            prefix={s.id}
            pageName={
              project.pages.find((p) => p.sections.some((x) => x.id === s.id))
                ?.name
            }
            eyebrow={s.eyebrow && text("eyebrow", "div", "site-eyebrow")}
            main={main}
            exporting={exporting}
            appApi={appApi}
            href={href}
          />
        );
        // Published pages show nothing for a section whose form is gone.
        if (
          exporting &&
          (appSectionProblem(project.app, s.appForm) ||
            !project.app?.forms.some((f) => f.id === s.appForm))
        )
          return null;
        return (
          <section className="site-app-section" style={style}>
            {area}
          </section>
        );
      }
      case "blocks":
        return s.root ? (
          <Nodes
            nodes={[s.root]}
            ctx={{
              project,
              exporting,
              href,
              currentPage,
              page: project.pages.find((p) => p.id === currentPage),
              inbox,
              appApi,
              dark,
              onToggleTheme,
              edit: blockEdit,
              logic,
            }}
          />
        ) : null;
      case "custom":
        return (
          <section className="site-custom" style={style}>
            <div className={`site-blocks site-width-${s.width ?? "normal"}`}>
              <Blocks
                blocks={s.blocks ?? []}
                href={href}
                editing={!!onEdit}
                selectedBlock={selectedBlock}
              />
            </div>
          </section>
        );
      case "footer":
        if (s.variant === "centered")
          return (
            <footer className="site-footer site-footer-centered" style={style}>
              <nav aria-label="Footer navigation" className="site-footer-links">
                {project.pages.map((p) => (
                  <a
                    tabIndex={tab}
                    key={p.id}
                    className="site-footer-page"
                    href={exporting ? pageHref(p.slug) : `/${p.slug}`}
                  >
                    {p.name}
                  </a>
                ))}
                {s.buttonLabel && (
                  <a tabIndex={tab} href={href(s.buttonUrl)}>
                    {text("buttonLabel")}
                  </a>
                )}
              </nav>
              {s.title && text("title", "p", "site-footer-line")}
              {s.body && text("body", "p", "site-footer-line")}
            </footer>
          );
        return (
          <footer className="site-footer" style={style}>
            <div>
              <div className="site-brand">
                {text("title")}
                {project.theme.brandDot !== false && (
                  <span className="site-brand-dot">.</span>
                )}
              </div>
              {text("body", "p")}
            </div>
            <nav aria-label="Footer navigation">{pages}</nav>
            <div className="site-copyright">
              © {new Date().getFullYear()} {project.name}. All rights reserved.
            </div>
          </footer>
        );
      default:
        if (s.type === "text" && s.variant === "notice")
          return (
            <section className="site-rich-text site-notice" style={style}>
              <div className="site-variant-inner">
                <div className="site-notice-box">
                  <Icon name="rw:info" size={16} className="site-notice-icon" />
                  <div className="site-notice-body">
                    {s.title &&
                      text("title", main ? "h1" : "p", "site-notice-title")}
                    {s.body && text("body", "div", "site-notice-text")}
                  </div>
                </div>
              </div>
            </section>
          );
        return (
          <section className="site-rich-text" style={style}>
            {heading}
            {button}
            {s.secondaryLabel && (
              <a
                tabIndex={tab}
                className="site-button site-button-secondary site-rich-secondary"
                href={href(s.secondaryUrl ?? "")}
              >
                {s.secondaryLabel}
                <Icon name="arrowUpRight" size={16} />
              </a>
            )}
          </section>
        );
    }
  })();
  return content;
}

/** Section types whose title isn't shown as a heading. */
const PLAIN_TITLES = new Set<Section["type"]>([
  "announcement",
  "header",
  "hero",
  "features",
  "custom",
  "footer",
]);
export function Website({
  project,
  page,
  selected,
  selectedBlock,
  onSelect,
  hovered,
  onHover,
  editingText,
  onStartEdit,
  onFinishEdit,
  onDraft,
  onNavigate,
  onAdd,
  emptyPage,
  onEdit,
  onEditNode,
  exporting = false,
  preview = false,
  item,
  onOpenItem,
  inbox,
  appApi,
  ownerHref,
  previewAs = NO_PREVIEW,
}: {
  project: Project;
  page: Page;
  /** The editor's "Preview as": page values, address, theme and day (src/blocks/logic). */
  previewAs?: PreviewAs;
  /** Where links to OWNER_LINK ("{owner}") go: the owner's app for this site. */
  ownerHref?: string;
  /** Published sites: the endpoint visitor action forms post to. */
  inbox?: string;
  /** Published sites: the public app API (`{appApi}/forms/:formId…`) app forms use. */
  appApi?: string;
  /** Render this collection item's page instead of `page`'s sections. */
  item?: { collection: Collection; item: CollectionItem };
  /** In preview, open an item page instead of leaving the editor. */
  onOpenItem?: (collection: string, item: string) => void;
  selected?: string | null;
  selectedBlock?: string | null;
  onSelect?: (id: string, field?: TextField, block?: string) => void;
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  editingText?: TextEditTarget | null;
  onStartEdit?: (target: TextEditTarget) => void;
  onFinishEdit?: () => void;
  onDraft?: (text: string) => void;
  onNavigate?: (id: string) => void;
  onAdd?: () => void;
  /** The editor's blank-page panel, shown instead of the plain "add a section". */
  emptyPage?: ReactNode;
  onEdit?: (id: string, values: Partial<Section>) => void;
  /** Typing into a block: sets one of its props. */
  onEditNode?: (
    section: string,
    node: string,
    key: string,
    value: string,
  ) => void;
  exporting?: boolean;
  preview?: boolean;
}) {
  const sections = [
    ...project.header,
    ...(item ? [] : page.sections),
    ...project.footer,
  ];
  // Every page gets one main heading: the hero's, or else the first section title.
  const visible = page.sections.filter((s) => !s.hidden);
  const mainHeading =
    item || visible.some((s) => s.type === "hero" && s.title)
      ? undefined
      : visible.find((s) => s.title && !PLAIN_TITLES.has(s.type))?.id;
  const theme = project.theme;
  // The visitor's light/dark choice in preview; until they pick, the device decides.
  const [chosen, setMode] = useState<"light" | "dark">();
  // "Preview as" a theme: the editor's canvas, and where Preview starts.
  const mode =
    (!preview || !chosen) && previewAs.theme ? previewAs.theme : chosen;
  const toggleTheme = () =>
    setMode(() => {
      const now =
        mode ??
        (window.matchMedia?.("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light");
      return now === "dark" ? "light" : "dark";
    });
  // Clicks, "show only when" and page values (src/blocks/logic).
  const { logic, handle, toast } = usePageLogic({
    page,
    sections,
    previewAs: exporting ? NO_PREVIEW : previewAs,
    preview: preview && !exporting,
    dark:
      !!theme.darkToggle &&
      !exporting &&
      (mode
        ? mode === "dark"
        : !!preview &&
          typeof window !== "undefined" &&
          !!window.matchMedia?.("(prefers-color-scheme: dark)").matches),
    onNavigate: (id) => onNavigate?.(id),
  });
  const blockCss = treeCss(
    sections.flatMap((s) => (s.type === "blocks" && s.root ? [s.root] : [])),
    !preview,
  );
  // A "brand" header, or a tab bar block in the header, adds the phone's bottom bar.
  const tabs = tabBarOf(project);
  const clickLink = (event: MouseEvent) => {
    if (!preview || exporting) return;
    if (handle(event)) return;
    const a = (event.target as HTMLElement).closest("a");
    if (!a) return;
    const url = a.getAttribute("href");
    const [, slug, itemSlug] =
      /^\/([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(url ?? "") ?? [];
    const c = project.collections?.find((x) => x.slug === slug && x.itemPages);
    const target = c?.items.find((i) => i.slug === itemSlug && !i.hidden);
    if (c && target) {
      event.preventDefault();
      onOpenItem?.(c.id, target.id);
      return;
    }
    const destination = project.pages.find((p) => `/${p.slug}` === url);
    if (destination) {
      event.preventDefault();
      a.closest("details")?.removeAttribute("open");
      onNavigate?.(destination.id);
    }
  };
  const renderSection = (s: Section) => (
    <Fragment key={s.id}>
      {s.responsive && responsiveCss(s, !preview) && (
        <style
          dangerouslySetInnerHTML={{ __html: responsiveCss(s, !preview) }}
        />
      )}
      <div
        data-section-id={s.id}
        data-animation={
          s.animation && s.animation !== "none" ? s.animation : undefined
        }
        className={`site-section ${selected === s.id && !preview ? "is-selected" : ""} ${hovered === s.id && !preview ? "is-hovered" : ""}`}
        onPointerEnter={preview ? undefined : () => onHover?.(s.id)}
        onPointerLeave={preview ? undefined : () => onHover?.(null)}
        tabIndex={preview ? undefined : 0}
        role={preview ? undefined : "group"}
        aria-label={preview ? undefined : `Edit ${s.name}`}
        onClick={
          preview
            ? undefined
            : (e) => {
                e.stopPropagation();
                e.preventDefault();
                const target = (e.target as HTMLElement).closest<HTMLElement>(
                  "[data-node-id],[data-block-id]",
                );
                onSelect?.(
                  s.id,
                  undefined,
                  target?.dataset.nodeId ?? target?.dataset.blockId,
                );
              }
        }
        onKeyDown={
          preview
            ? undefined
            : (e) => {
                if (
                  e.target === e.currentTarget &&
                  ["Enter", " "].includes(e.key)
                ) {
                  e.preventDefault();
                  onSelect?.(s.id);
                }
              }
        }
      >
        <div className="site-section-content">
          <SectionContent
            section={s}
            project={project}
            exporting={exporting}
            inbox={inbox}
            appApi={appApi}
            onEdit={
              !preview && onEdit
                ? (field, value) => onEdit(s.id, { [field]: value })
                : undefined
            }
            onActivate={(field) => onSelect?.(s.id, field)}
            editingField={
              editingText?.section === s.id ? editingText.field : undefined
            }
            onStartEdit={(field) => onStartEdit?.({ section: s.id, field })}
            onFinishEdit={onFinishEdit}
            onDraft={onDraft}
            selectedBlock={selected === s.id ? selectedBlock : null}
            main={s.id === mainHeading}
            ownerHref={ownerHref}
            currentPage={item ? undefined : page.id}
            dark={mode === undefined ? undefined : mode === "dark"}
            onToggleTheme={preview && !exporting ? toggleTheme : undefined}
            logic={logic}
            blockEdit={
              !preview && onEditNode && s.type === "blocks"
                ? {
                    selected:
                      selected === s.id ? (selectedBlock ?? null) : null,
                    typing:
                      editingText?.section === s.id
                        ? (editingText.node ?? null)
                        : null,
                    onStartTyping: (node) =>
                      onStartEdit?.({ section: s.id, field: "body", node }),
                    onFinishTyping: () => onFinishEdit?.(),
                    onCommit: (node, key, value) =>
                      onEditNode(s.id, node, key, value),
                    onDraft,
                    onSelect: (node) => onSelect?.(s.id, undefined, node),
                  }
                : undefined
            }
          />
        </div>
        {!preview && (
          <div className="section-hover-chrome" aria-hidden="true">
            <span className="section-hover-label">
              <Icon name={sectionMeta[s.type].icon} size={14} />
              <span>{s.name}</span>
            </span>
          </div>
        )}
      </div>
    </Fragment>
  );
  return (
    <div
      className={`website font-${theme.font} scale-${theme.scale ?? "balanced"} spacing-${theme.spacing ?? "comfortable"} buttons-${theme.buttons ?? "solid"} ${preview ? "website-preview" : "website-editing"} ${editingText ? "is-text-editing" : ""}${theme.darkToggle ? " site-themes" : ""}`}
      data-theme={theme.darkToggle ? mode : undefined}
      style={
        (theme.darkToggle
          ? {
              // Light colours go in via these; website.css swaps in the dark palette.
              "--site-accent": theme.accent,
              "--site-light-background": theme.background,
              "--site-light-color": theme.color,
              "--site-radius": `${theme.radius}px`,
              background: "var(--site-background)",
              color: "var(--site-color)",
            }
          : {
              "--site-accent": theme.accent,
              "--site-background": theme.background,
              "--site-color": theme.color,
              "--site-radius": `${theme.radius}px`,
              background: theme.background,
              color: theme.color,
            }) as unknown as CSSProperties
      }
      onClick={clickLink}
    >
      {blockCss && <style dangerouslySetInnerHTML={{ __html: blockCss }} />}
      {sections
        .filter(
          (s) =>
            !s.hidden &&
            (!item || project.header.includes(s)) &&
            !project.footer.includes(s),
        )
        .map(renderSection)}
      {!item &&
        !page.sections.some((s) => !s.hidden) &&
        !preview &&
        (emptyPage ?? (
          <button className="site-empty" onClick={onAdd}>
            <Icon name="plus" size={28} />
            <strong>Your next great idea starts here.</strong>
            <span>Add a section to start building this page.</span>
          </button>
        ))}
      {!item && project.footer.filter((s) => !s.hidden).map(renderSection)}
      {item && (
        <div className="site-section">
          <div className="site-section-content">
            <ItemDetail
              collection={item.collection}
              item={item.item}
              exporting={exporting}
              project={project}
              inbox={inbox}
            />
          </div>
        </div>
      )}
      {item && project.footer.filter((s) => !s.hidden).map(renderSection)}
      {toast}
      {tabs && (
        <TabBar
          tabs={tabs}
          project={project}
          page={item ? undefined : page}
          href={(url) => resolveHref(url, project, exporting, ownerHref)}
          editing={!preview}
        />
      )}
    </div>
  );
}
