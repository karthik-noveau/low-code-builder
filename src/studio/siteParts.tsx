/**
 * Pieces of a published page shared by the classic sections (Website.tsx) and
 * the smart blocks (src/blocks/smart.tsx): collection cards, the moving
 * "orbits" background, the phone tab bar, the inbox forms and app forms.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import { safeImage, type Listing, type Page, type Project } from "./model";
import {
  formatValue,
  itemHref,
  itemPath,
  itemTitle,
  type Collection,
} from "./collections";
import { AppFormMarkup, type FormCustom } from "../apps/AppSection";
import { appLinks } from "../apps/links";
import { appSectionProblem } from "../apps/issues";
import type { Tab } from "../blocks/project";
import { INBOX_FIELDS, type InboxField } from "../blocks/forms/inbox";

export function CollectionCards({
  collection: c,
  listing,
  exporting,
  editing,
  href,
}: {
  collection: Collection;
  listing: Listing;
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

/**
 * The moving hero background: two tilted orbit sets with travelling lights,
 * two soft blooms, a dot texture and six motes. CSS does all the motion; this
 * (and the published page's app.js) only pauses it while it can't be seen.
 */
export function Ambient() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let visible = true;
    const update = () => {
      el.dataset.active = String(visible && !document.hidden);
    };
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? false;
            update();
          });
    observer?.observe(el);
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const orbit = (side: "right" | "left") => (
    <div className={`site-ambient-orbit site-ambient-${side}`}>
      <div className="site-ambient-tilt">
        {[0, 1, 2].map((n) => (
          <span className="site-ambient-ring" key={n}>
            <span className="site-ambient-runner" />
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div ref={ref} className="site-ambient" aria-hidden="true" data-ambient="">
      <div className="site-ambient-light">
        <span className="site-ambient-bloom" />
        <span className="site-ambient-bloom site-ambient-bloom-2" />
      </div>
      <span className="site-ambient-dots" />
      <div className="site-ambient-orbits">
        {orbit("right")}
        {orbit("left")}
      </div>
      <div className="site-ambient-motes">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span className="site-ambient-mote" key={n} />
        ))}
      </div>
    </div>
  );
}

/** Icons for the phone tab bar when a tab doesn't name one. */
function tabIcon(label: string, url: string, project: Project) {
  if (url === `/${project.pages[0]?.slug ?? ""}`) return "home";
  if (/reward|wallet|point|balance/i.test(label)) return "wallet";
  if (/add|purchase|order|receipt|bill|submit/i.test(label)) return "receipt";
  if (/contact|mail|message/i.test(label)) return "mail";
  if (/shop|product|store|menu/i.test(label)) return "store";
  return "pages";
}

/**
 * The phone's bottom navigation (as the Dhanlaxmi reference's TabBar): the
 * given tabs (short label, link, icon), or every page when there are none.
 * Hidden above phone width, where the header links show.
 */
export function TabBar({
  tabs: given,
  project,
  page,
  href,
  editing,
}: {
  tabs: Tab[];
  project: Project;
  page?: Page;
  href: (url: string) => string;
  editing: boolean;
}) {
  const tabs = given.length
    ? given
    : project.pages.map((p) => ({
        id: p.id,
        label: p.name,
        url: `/${p.slug}`,
        icon: undefined,
      }));
  return (
    <nav className="site-tabbar" aria-label="Phone navigation">
      {tabs.map((t) => (
        <a
          key={t.id}
          className="site-tab"
          href={href(t.url)}
          tabIndex={editing ? -1 : undefined}
          aria-current={
            page && t.url.trim() === `/${page.slug}` ? "page" : undefined
          }
        >
          <span className="site-tab-icon">
            <Icon
              name={`rw:${(t.icon || tabIcon(t.label, t.url.trim(), project)).replace(/^rw:/, "")}`}
              size={22}
            />
          </span>
          <span className="site-tab-label">{t.label}</span>
        </a>
      ))}
    </nav>
  );
}

/**
 * The Contact and Email signup form. It posts to the Forma inbox (or the
 * owner's own endpoint, an https address); in the editor it never sends.
 * `fields` and `extras` come from an inbox form block (its field blocks and
 * any other blocks the owner put in it).
 */
export function SiteForm({
  kind,
  buttonLabel,
  formAction,
  inbox,
  editing,
  exporting,
  className,
  attrs,
  fields = INBOX_FIELDS[kind],
  extras,
  buttonAttrs,
}: {
  kind: "contact" | "newsletter";
  buttonLabel: string;
  /** The owner's own endpoint; the inbox otherwise. */
  formAction: string;
  inbox?: string;
  editing: boolean;
  exporting: boolean;
  className?: string;
  attrs?: Record<string, string | undefined>;
  fields?: InboxField[];
  extras?: ReactNode;
  buttonAttrs?: Record<string, string | undefined>;
}) {
  const custom = /^https?:\/\//i.test(formAction);
  const endpoint = custom ? formAction : inbox;
  const connected = !!endpoint;
  // In the editor the form looks the same but never takes input or sends,
  // and its field and button blocks stay clickable (so they can be selected).
  const still = editing
    ? ({ readOnly: true, tabIndex: -1 } as const)
    : undefined;
  return (
    <form
      {...attrs}
      className={className}
      action={endpoint}
      method="POST"
      onSubmit={(e) => {
        if (!connected || editing) e.preventDefault();
      }}
    >
      {!custom && inbox && (
        <>
          <input type="hidden" name="form" value={kind} />
          <label className="site-request-trap" aria-hidden="true">
            Leave empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </>
      )}
      {fields.map((f) => (
        <label key={f.name} {...f.attrs}>
          {f.hideLabel ? <span className="sr-only">{f.label}</span> : f.label}
          {f.name === "message" ? (
            <textarea
              name="message"
              rows={4}
              placeholder={f.placeholder}
              required
              {...still}
            />
          ) : (
            <input
              type={f.name === "email" ? "email" : undefined}
              name={f.name}
              placeholder={f.placeholder}
              required
              {...still}
            />
          )}
        </label>
      ))}
      {extras}
      <button
        {...buttonAttrs}
        className="site-button"
        type={editing ? "button" : "submit"}
        tabIndex={editing ? -1 : undefined}
        disabled={!connected && exporting}
      >
        {buttonLabel}
        <Icon name="arrow" size={16} />
      </button>
      {!connected && exporting && (
        <small>Form submissions haven’t been connected yet.</small>
      )}
    </form>
  );
}

/**
 * An app form or lookup with its heading: the form's title and intro, or a
 * breadcrumb over step-by-step forms and lookups (their cards carry the
 * headings). Null on a published page when the form is gone.
 */
export function AppFormArea({
  project,
  formId,
  prefix,
  pageName,
  heading = true,
  eyebrow,
  main,
  exporting,
  appApi,
  href,
  custom,
  titleAttrs,
}: {
  /** A classic-look form block's own words and blocks. */
  custom?: FormCustom;
  /** Editor: marks the title as its block. */
  titleAttrs?: Record<string, string | undefined>;
  project: Project;
  formId?: string;
  /** Makes the form's element ids unique on the page. */
  prefix: string;
  /** The page it's on, shown last in the breadcrumb. */
  pageName?: string;
  /** Show the form's title and intro (or breadcrumb) above it. */
  heading?: boolean;
  eyebrow?: ReactNode;
  /** The title is the page's main heading. */
  main: boolean;
  exporting: boolean;
  appApi?: string;
  href: (url: string) => string;
}) {
  const form = project.app?.forms.find((f) => f.id === formId);
  const problem = appSectionProblem(project.app, formId);
  if ((problem || !form || !project.app) && exporting) return null;
  const say = (key: string, shown: string) =>
    custom?.text ? custom.text(key, shown) : shown;
  return (
    <>
      {!heading ? null : form && (form.steps || form.highlight) ? (
        <div className="site-app-heading site-app-crumbs">
          <nav aria-label="Breadcrumb" className="site-breadcrumb">
            <a href={href("/")}>{project.pages[0]?.name || "Home"}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{pageName ?? form.title}</span>
          </nav>
          {main ? (
            <h1 {...titleAttrs} className="sr-only">
              {form.title}
            </h1>
          ) : (
            <h2 {...titleAttrs} className="sr-only">
              {form.title}
            </h2>
          )}
        </div>
      ) : (
        <div className="site-app-heading">
          {eyebrow}
          {form?.title &&
            (main ? (
              <h1 {...titleAttrs} className="site-title-main">
                {say("title", form.title)}
              </h1>
            ) : (
              <h2 {...titleAttrs}>{say("title", form.title)}</h2>
            ))}
          {form?.intro && (
            <p className="site-description">{say("intro", form.intro)}</p>
          )}
        </div>
      )}
      {form && project.app ? (
        <AppFormMarkup
          app={project.app}
          form={form}
          appApi={appApi}
          prefix={prefix}
          collections={project.collections}
          mode={exporting ? (appApi ? "live" : "export") : "editor"}
          links={appLinks(project.app, project.pages, form, href)}
          custom={custom}
        />
      ) : (
        <p className="site-listing-empty site-app-empty">
          <Icon name="activity" size={18} />
          {problem}
        </p>
      )}
    </>
  );
}
