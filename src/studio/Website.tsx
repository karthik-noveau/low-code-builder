import { Fragment, useState, type CSSProperties, type MouseEvent } from "react";
import { InlineText, type TextField, type TextEditTarget } from "./InlineText";
import { Icon } from "./Icon";
import {
  safeImage,
  safeUrl,
  pageHref,
  sectionMeta,
  type Block,
  type Section,
  type Project,
  type Page,
} from "./model";
import { responsiveCss } from "./responsive";
import {
  formatValue,
  itemHref,
  itemPath,
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
import "./website.css";

function resolveHref(url: string, project: Project, exporting: boolean) {
  const safe = safeUrl(url);
  const page = project.pages.find((p) => `/${p.slug}` === safe);
  return exporting && page ? pageHref(page.slug) : safe;
}
function CollectionCards({
  collection: c,
  listing,
  exporting,
  editing,
  href,
}: {
  collection: Collection;
  listing: NonNullable<Section["listing"]>;
  exporting: boolean;
  editing: boolean;
  href: (url: string) => string;
}) {
  const d = c.display;
  const items = c.items.filter((i) => !i.hidden);
  const shown = listing.limit ? items.slice(0, listing.limit) : items;
  if (!shown.length)
    return editing ? (
      <p className="site-listing-empty">
        {c.name} has no visible items yet. Add some in Data.
      </p>
    ) : null;
  return (
    <div
      className={`site-listing site-listing-${listing.style}`}
      style={{ "--columns": listing.columns } as CSSProperties}
    >
      {shown.map((item) => {
        const v = (field: string) => (field ? (item.values[field] ?? "") : "");
        const image = safeImage(v(d.image));
        const content = (
          <>
            {image && (
              <img
                className="site-listing-image"
                src={image}
                alt={itemTitle(c, item)}
                loading="lazy"
              />
            )}
            <div className="site-listing-copy">
              <div className="site-listing-title">
                <h3>{itemTitle(c, item)}</h3>
                {v(d.price) && (
                  <span className="site-listing-price">
                    {formatValue(c, d.price, v(d.price))}
                  </span>
                )}
              </div>
              {v(d.subtitle) && (
                <span className="site-listing-meta">
                  {formatValue(c, d.subtitle, v(d.subtitle))}
                </span>
              )}
              {v(d.summary) && d.summary !== d.subtitle && (
                <p>{formatValue(c, d.summary, v(d.summary))}</p>
              )}
            </div>
          </>
        );
        return c.itemPages ? (
          <a
            key={item.id}
            className="site-listing-card"
            tabIndex={editing ? -1 : undefined}
            href={exporting ? itemHref(c, item) : itemPath(c, item)}
          >
            {content}
          </a>
        ) : (
          <article key={item.id} className="site-listing-card">
            {content}
            {v(d.action) && d.actionLabel && (
              <a
                className="site-text-link"
                tabIndex={editing ? -1 : undefined}
                href={href(v(d.action))}
              >
                {d.actionLabel}
                <Icon name="arrow" size={14} />
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
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
      p.sections.some((x) => !x.hidden && x.listing?.collection === c.id),
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
}: {
  section: Section;
  project: Project;
  exporting?: boolean;
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
  const href = (url: string) => resolveHref(url, project, exporting);
  const heading = (
    <>
      {s.eyebrow && text("eyebrow", "div", "site-eyebrow")}
      {s.title && text("title", "h2")}
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
        return (
          <header className="site-header" style={style}>
            <a
              tabIndex={onEdit ? -1 : undefined}
              className="site-brand"
              href={exporting ? "index.html" : "/"}
            >
              {text("title")}
              <span className="site-brand-dot">.</span>
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
          </header>
        );
      case "hero":
        return (
          <section
            className={`site-hero ${s.layout === "split" ? "site-hero-split" : ""}`}
            style={style}
          >
            {image && (
              <img className="site-hero-image" src={image} alt={s.imageAlt} />
            )}
            <div
              className="site-hero-shade"
              style={{ opacity: s.overlay / 100 }}
            />
            <div className="site-hero-copy">
              {text("eyebrow", "div", "site-eyebrow")}
              {text("title", "h1")}
              {text("body", "p")}
              {button}
            </div>
            <span className="site-hero-note">{project.name.toUpperCase()}</span>
          </section>
        );
      case "features":
        return (
          <section className="site-features" style={style}>
            {s.items.map((i, n) => (
              <div key={i.id}>
                <Icon name={["leaf", "truck", "heart"][n % 3]} size={25} />
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
      case "newsletter": {
        const connected = /^https?:\/\//i.test(s.formAction);
        return (
          <section
            className={`site-form-section ${s.type === "contact" ? "site-contact" : ""}`}
            style={style}
          >
            <div>{heading}</div>
            <form
              inert={!!onEdit || undefined}
              action={connected ? s.formAction : undefined}
              method="POST"
              onSubmit={(e) => {
                if (!connected) e.preventDefault();
              }}
            >
              {s.type === "contact" && (
                <label>
                  Your name
                  <input name="name" placeholder="Alex Smith" required />
                </label>
              )}
              <label>
                {s.type === "contact" ? (
                  "Email address"
                ) : (
                  <span className="sr-only">Email address</span>
                )}
                <input
                  type="email"
                  name="email"
                  placeholder="Your email address"
                  required
                />
              </label>
              {s.type === "contact" && (
                <label>
                  What’s on your mind?
                  <textarea
                    name="message"
                    rows={4}
                    placeholder="Tell us a little about it…"
                    required
                  />
                </label>
              )}
              <button
                className="site-button"
                type="submit"
                disabled={!connected}
              >
                {s.buttonLabel}
                <Icon name="arrow" size={16} />
              </button>
              {!connected && (
                <small>Form submissions haven’t been connected yet.</small>
              )}
            </form>
          </section>
        );
      }
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
        return (
          <footer className="site-footer" style={style}>
            <div>
              <div className="site-brand">
                {text("title")}
                <span className="site-brand-dot">.</span>
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
        return (
          <section className="site-rich-text" style={style}>
            {heading}
            {button}
          </section>
        );
    }
  })();
  return content;
}

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
  onEdit,
  exporting = false,
  preview = false,
  item,
  onOpenItem,
  inbox,
}: {
  project: Project;
  page: Page;
  /** Published sites: the endpoint visitor action forms post to. */
  inbox?: string;
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
  onEdit?: (id: string, values: Partial<Section>) => void;
  exporting?: boolean;
  preview?: boolean;
}) {
  const sections = [
    ...project.header,
    ...(item ? [] : page.sections),
    ...project.footer,
  ];
  const theme = project.theme;
  const clickLink = (event: MouseEvent) => {
    if (!preview || exporting) return;
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
                const block = (e.target as HTMLElement).closest<HTMLElement>(
                  "[data-block-id]",
                )?.dataset.blockId;
                onSelect?.(s.id, undefined, block);
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
      className={`website font-${theme.font} scale-${theme.scale ?? "balanced"} spacing-${theme.spacing ?? "comfortable"} buttons-${theme.buttons ?? "solid"} ${preview ? "website-preview" : "website-editing"} ${editingText ? "is-text-editing" : ""}`}
      style={
        {
          "--site-accent": theme.accent,
          "--site-background": theme.background,
          "--site-color": theme.color,
          "--site-radius": `${theme.radius}px`,
          background: theme.background,
          color: theme.color,
        } as CSSProperties
      }
      onClick={clickLink}
    >
      {sections
        .filter((s) => !s.hidden && (!item || project.header.includes(s)))
        .map(renderSection)}
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
      {!item && !page.sections.some((s) => !s.hidden) && !preview && (
        <button className="site-empty" onClick={onAdd}>
          <Icon name="plus" size={28} />
          <strong>Your next great idea starts here.</strong>
          <span>Add a section to start building this page.</span>
        </button>
      )}
    </div>
  );
}
