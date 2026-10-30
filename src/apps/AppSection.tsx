/**
 * The markup of an "app" section. Published sites get every step server
 * rendered (later steps `hidden`), so the script in widget.ts only toggles
 * steps, fills in what the API returns and sends. In the editor and in ZIP
 * exports only the first step shows, with every control disabled and a note
 * saying where it works (the same markup in both, so previews match exports).
 *
 * Contract with widget.ts (APP_SCRIPT):
 * - root `.app-form[data-app-api][data-form]`, `data-kind` submit|lookup,
 *   `data-identify` when visitors identify first, `data-capacity` (JSON:
 *   `[{ id, group, size?, unit, message }]`) when places can run out.
 * - steps `[data-step]`: identify, confirm, menu, fields, pay, done (submit);
 *   lookup, result (lookup). Forms are <form> elements.
 * - inputs are named by field id; `identity` (identify step), `value` and
 *   `verify` (lookup step), honeypot `website`. Inputs carry `data-label`
 *   (the field's name) for messages.
 * - an "items" field is a `[data-picker=<field id>]` on the menu step
 *   (`data-required`, `data-currency`), with `.app-menu-item[data-slug]
 *   [data-price][data-title]` rows holding `.app-add` and `.app-stepper`
 *   (`.app-count`); `.app-cartbar` (`.app-cartbar-count`, `.app-cartbar-total`)
 *   opens the fields step, whose `.app-cart[data-field]` lists
 *   `.app-cart-lines` and `.app-cart-sum`.
 * - an "item" field is radio cards (`.app-choice` with `.app-left`) or a
 *   select; `.app-places` reports places left.
 * - `.app-error` per step, `.app-field-error` per field, `.app-status`
 *   (aria-live) on the root; `[data-action]` buttons: confirm, change, again,
 *   add, more, less, checkout, menu, refresh, paid. `.app-match`,
 *   `.app-who-name`, `.app-done-text`, `.app-record-fields`, `.app-totals`,
 *   `.app-timeline`, `.app-history-empty`, `.app-result-*`, `.app-steps`,
 *   `.app-lines` and `.app-pay-*` are filled in.
 */
import type { ReactNode } from "react";
import { Icon } from "../studio/Icon";
import type { Collection } from "../studio/collections";
import { currencySymbol, makeCatalog, type Catalog } from "./catalog";
import {
  fieldOf,
  tableOf,
  REF_KEY,
  type App,
  type AppField,
  type AppForm,
  type AppTable,
  type FormCopyKey,
} from "./model";

export type AppSectionMode = "live" | "editor" | "export";
type Attrs = Record<string, string | undefined>;
/**
 * A form block with the classic look (src/blocks/forms/FormBlocks.tsx) draws
 * this markup with its own blocks' words: the buttons' labels, blocks the
 * owner added inside a step, and (editor) which block each piece is.
 */
export interface FormCustom {
  words?: Partial<Record<"continue" | "confirm" | "change" | "again", string>>;
  /** The owner's own blocks in a step, drawn before its error line. */
  extras?: Partial<Record<"identify" | "fields" | "lookup", ReactNode>>;
  /** Editor attributes for a piece: a field id, "identity", "value", "verify" or "button". */
  attrs?: (key: string) => Attrs | undefined;
  /**
   * Editor: draws a piece's words so they can be typed into. The key is
   * "title", "intro", a copy key, a button's key, or "label:" / "hint:" and
   * a field's key.
   */
  text?: (key: string, shown: string) => ReactNode;
}
/** A piece's words: as they are, or (editor) typed into (FormCustom.text). */
type Say = (key: string, shown: string) => ReactNode;
import type { AppLinks } from "./links";

/** Icons the step screens use that the editor's icon set doesn't have. */
const STATE_ICONS: Record<string, string> = {
  checkCircle: "M21 11.1V12a9 9 0 1 1-5.3-8.2M21 4.5 12 13.5l-2.7-2.7",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  alertCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 8v4.5M12 16h.01",
  alertTriangle:
    "M10.3 4 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0ZM12 9.5V13M12 16.5h.01",
  xCircle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM15 9l-6 6M9 9l6 6",
  refresh:
    "M20 12a8 8 0 0 1-14 5.3L4 15.5M4 12a8 8 0 0 1 14-5.3L20 8.5M20 4v4.5h-4.5M4 20v-4.5h4.5",
  shield: "M12 21s7.5-3.6 7.5-9.4V5.8L12 3 4.5 5.8v5.8C4.5 17.4 12 21 12 21Z",
  arrowLeft: "M20 12H4m6-6-6 6 6 6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16v-4.5M12 8h.01",
};
export function StateIcon({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  if (!STATE_ICONS[name]) return <Icon name={name} size={size} />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={STATE_ICONS[name]} />
    </svg>
  );
}
/** The owner's words for a part of the form, or the default. */
const words = (form: AppForm, key: FormCopyKey, fallback: string) =>
  form.copy?.[key]?.trim() || fallback;
/** How a field is drawn in a step-by-step form: a prefix, a bigger input. */
interface FieldLook {
  prefix?: string;
  large?: boolean;
  /** Money typed as text ("18,400"), checked by the widget. */
  money?: boolean;
  /** Indian mobile numbers: ten digits. */
  mobile?: boolean;
  /** A taller text box. */
  tall?: boolean;
}

function inputFor(
  field: AppField,
  id: string,
  disabled: boolean,
  placeholder?: string,
  look: FieldLook = {},
) {
  const common = {
    id,
    placeholder: placeholder ?? (field.placeholder || undefined),
    name: field.id,
    required: field.required || undefined,
    disabled: disabled || undefined,
    "aria-describedby": field.hint ? `${id}-hint ${id}-error` : `${id}-error`,
    "data-label": field.name,
    "data-minlength":
      field.minLength && (field.type === "text" || field.type === "longText")
        ? field.minLength
        : undefined,
    className: look.large ? "app-input-lg" : undefined,
  };
  switch (field.type) {
    case "longText":
      return (
        <textarea
          {...common}
          rows={look.tall ? 4 : 3}
          maxLength={field.maxLength || 2000}
        />
      );
    case "choice":
      return (
        <select {...common} defaultValue="">
          <option value="" disabled={field.required || undefined}>
            Choose…
          </option>
          {field.options
            .filter((o) => o.trim())
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      );
    case "yesNo":
      return (
        <input {...common} type="checkbox" value="true" required={undefined} />
      );
    case "number":
    case "money":
      if (look.money)
        return (
          <input
            {...common}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            data-money=""
            data-min={field.min}
            data-max={field.max}
          />
        );
      return (
        <input
          {...common}
          type="number"
          inputMode={field.type === "money" ? "decimal" : "numeric"}
          step="any"
          min={field.min}
          max={field.max}
        />
      );
    case "phone":
      return (
        <input
          {...common}
          type="tel"
          inputMode={look.mobile ? "numeric" : "tel"}
          autoComplete={look.mobile ? "tel-national" : "tel"}
          maxLength={look.mobile ? 16 : 20}
          data-mobile={look.mobile ? "" : undefined}
        />
      );
    case "email":
      return (
        <input {...common} type="email" autoComplete="email" maxLength={200} />
      );
    case "date":
      return <input {...common} type="date" />;
    default:
      return (
        <input {...common} type="text" maxLength={field.maxLength || 200} />
      );
  }
}

const Optional = ({ field }: { field: AppField }) =>
  field.required ? null : <small> (optional)</small>;

/** An "item" field: cards to tap, or a select when there are many. */
export function ItemChoice({
  field,
  id,
  disabled,
  catalog,
  attrs,
  say = (_, shown) => shown,
}: {
  field: AppField;
  id: string;
  disabled: boolean;
  catalog: Catalog;
  /** Editor: marks the field as its block (classic-look form blocks). */
  attrs?: Attrs;
  say?: Say;
}) {
  const items = catalog(field.collection)?.items ?? [];
  const error = `${id}-error`;
  if (!items.length || items.length > 8)
    return (
      <div {...attrs} className="app-field app-wide">
        <label htmlFor={id}>
          {say("label", field.name)}
          <Optional field={field} />
        </label>
        <select
          id={id}
          name={field.id}
          required={field.required || undefined}
          disabled={disabled || undefined}
          aria-describedby={error}
          data-label={field.name}
          data-item=""
          defaultValue=""
        >
          <option value="" disabled={field.required || undefined}>
            {items.length ? "Choose…" : "Nothing to choose yet"}
          </option>
          {items.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.priceText ? `${i.title} · ${i.priceText}` : i.title}
            </option>
          ))}
        </select>
        <small className="app-field-error" id={error} hidden />
      </div>
    );
  return (
    <fieldset {...attrs} className="app-field app-wide app-choices">
      <legend>
        {say("label", field.name)}
        <Optional field={field} />
      </legend>
      <div className="app-choice-grid">
        {items.map((i, index) => (
          <label
            className={`app-choice ${i.image ? "has-image" : ""}`}
            key={i.slug}
          >
            <input
              type="radio"
              id={index === 0 ? id : undefined}
              name={field.id}
              value={i.slug}
              required={field.required || undefined}
              disabled={disabled || undefined}
              aria-describedby={error}
              data-label={field.name}
              data-item=""
            />
            {i.image && (
              <img className="app-choice-image" src={i.image} alt="" />
            )}
            <span className="app-choice-copy">
              <strong>{i.title}</strong>
              {(i.subtitle || i.summary) && (
                <small>{i.subtitle || i.summary}</small>
              )}
            </span>
            {i.priceText && (
              <span className="app-choice-price">{i.priceText}</span>
            )}
            <span className="app-left" hidden />
          </label>
        ))}
      </div>
      <small className="app-field-error" id={error} hidden />
    </fieldset>
  );
}

function FieldInput({
  field,
  prefix,
  disabled,
  name,
  catalog,
  placeholder,
  look,
  attrs,
  say = (_, shown) => shown,
}: {
  attrs?: Attrs;
  /** A label's or hint's words ("label" or "hint"). */
  say?: Say;
  field: AppField;
  prefix: string;
  disabled: boolean;
  /** Overrides the input's name (identify and lookup steps). */
  name?: string;
  catalog: Catalog;
  placeholder?: string;
  look?: FieldLook;
}) {
  const id = `${prefix}-${name ?? field.id}`;
  if (field.type === "item" && !name)
    return (
      <ItemChoice
        field={field}
        id={id}
        disabled={disabled}
        catalog={catalog}
        attrs={attrs}
        say={say}
      />
    );
  const control = inputFor(
    name ? { ...field, id: name, required: true } : field,
    id,
    disabled,
    placeholder,
    look,
  );
  const input = look?.prefix ? (
    <div
      className={`app-input-group ${look.prefix.length > 1 ? "app-input-group-wide" : ""}`}
    >
      <span className="app-input-prefix" aria-hidden="true">
        {look.prefix}
      </span>
      {control}
    </div>
  ) : (
    control
  );
  const hint = field.hint && (
    <small className="app-hint-text" id={`${id}-hint`}>
      {say("hint", field.hint)}
    </small>
  );
  const counter = field.type === "longText" && !!field.maxLength && (
    <small
      className="app-counter"
      data-counter={id}
      data-max={field.maxLength}
      aria-hidden="true"
    >
      {`0 / ${field.maxLength}`}
    </small>
  );
  if (field.type === "yesNo" && !name)
    return (
      <div {...attrs} className="app-field app-check">
        <label htmlFor={id}>
          {input}
          <span>{say("label", field.name)}</span>
        </label>
        {hint}
        <small className="app-field-error" id={`${id}-error`} hidden />
      </div>
    );
  return (
    <div
      {...attrs}
      className={`app-field ${field.type === "longText" ? "app-wide" : ""}`}
    >
      <label htmlFor={id}>
        {say("label", field.name)}
        {!name && <Optional field={field} />}
      </label>
      {input}
      {hint}
      <small className="app-field-error" id={`${id}-error`} hidden />
      {counter}
    </div>
  );
}

/** An "items" field: the menu or catalogue, with Add and − 1 + on each item. */
export function Picker({
  field,
  prefix,
  disabled,
  catalog,
}: {
  field: AppField;
  prefix: string;
  disabled: boolean;
  catalog: Catalog;
}) {
  const found = catalog(field.collection);
  const id = `${prefix}-${field.id}`;
  if (!found?.items.length)
    return (
      <div className="app-picker" data-picker={field.id}>
        <h3 className="app-step-title" tabIndex={-1}>
          {field.name}
        </h3>
        <p className="app-picker-empty">Nothing to order yet.</p>
      </div>
    );
  const groups = found.categories.length
    ? [
        ...found.categories.map((name) => ({
          name,
          items: found.items.filter((i) => i.category === name),
        })),
        {
          name: "More",
          items: found.items.filter(
            (i) => !found.categories.includes(i.category),
          ),
        },
      ].filter((g) => g.items.length)
    : [{ name: "", items: found.items }];
  return (
    <div
      className="app-picker"
      data-picker={field.id}
      data-required={field.required ? "" : undefined}
      data-currency={found.collection.currency}
      aria-labelledby={`${id}-title`}
      role="group"
    >
      <h3 className="app-step-title" id={`${id}-title`} tabIndex={-1}>
        {field.name}
      </h3>
      {groups.length > 1 && (
        <nav className="app-chips" aria-label={`${field.name} sections`}>
          {groups.map((g, i) =>
            disabled ? (
              <span key={g.name} className="app-chip">
                {g.name}
              </span>
            ) : (
              <a key={g.name} className="app-chip" href={`#${id}-group-${i}`}>
                {g.name}
              </a>
            ),
          )}
        </nav>
      )}
      {groups.map((g, gi) => (
        <section
          className="app-menu-group"
          key={g.name || "all"}
          id={`${id}-group-${gi}`}
          aria-label={g.name || field.name}
        >
          {g.name && <h4 className="app-menu-heading">{g.name}</h4>}
          <ul className="app-menu">
            {g.items.map((i) => (
              <li
                key={i.slug}
                className={`app-menu-item ${i.image ? "has-image" : ""}`}
                data-slug={i.slug}
                data-price={i.price ?? 0}
                data-title={i.title}
              >
                <div className="app-menu-copy">
                  <strong className="app-menu-name">{i.title}</strong>
                  {i.subtitle && (
                    <span className="app-menu-tag">{i.subtitle}</span>
                  )}
                  {i.priceText && (
                    <span className="app-menu-price">{i.priceText}</span>
                  )}
                  {i.summary && <p className="app-menu-summary">{i.summary}</p>}
                </div>
                <div className="app-menu-side">
                  {i.image && (
                    <img
                      className="app-menu-image"
                      src={i.image}
                      alt=""
                      loading="lazy"
                    />
                  )}
                  <button
                    type="button"
                    className="app-add"
                    data-action="add"
                    disabled={disabled || undefined}
                    aria-label={`Add ${i.title}`}
                  >
                    Add
                    <Icon name="plus" size={14} />
                  </button>
                  <div className="app-stepper" hidden>
                    <button
                      type="button"
                      data-action="less"
                      disabled={disabled || undefined}
                      aria-label={`Remove one ${i.title}`}
                    >
                      <span aria-hidden="true">−</span>
                    </button>
                    <span className="app-count" aria-live="polite">
                      0
                    </span>
                    <button
                      type="button"
                      data-action="more"
                      disabled={disabled || undefined}
                      aria-label={`Add one more ${i.title}`}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export const ErrorLine = () => <p className="app-error" role="alert" hidden />;

/** A step's heading and lead line, as in the step-by-step forms. */
function StepHead({
  title,
  lead,
  say = (_, shown) => shown,
}: {
  title: string;
  lead?: string;
  /** The title's and lead's words ("title" or "lead"). */
  say?: Say;
}) {
  return (
    <div className="app-step-head">
      {title && (
        <h3 className="app-step-title" tabIndex={-1}>
          {say("title", title)}
        </h3>
      )}
      {lead && <p className="app-lead">{say("lead", lead)}</p>}
    </div>
  );
}
/** A centred screen: icon, title, text and what to do next. */
function StateScreen({
  step,
  icon,
  tone,
  title,
  body,
  children,
  alert,
}: {
  step: string;
  icon: string;
  tone: "danger" | "neutral" | "success" | "brand";
  title: string;
  /** Empty: the widget shows the server's message. */
  body: string;
  children: ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className="app-step app-card app-state"
      data-step={step}
      role={alert ? "alert" : undefined}
      hidden
    >
      <span className={`app-state-icon tone-${tone}`} aria-hidden="true">
        <StateIcon name={icon} size={26} />
      </span>
      <div>
        <h3 className="app-step-title" tabIndex={-1}>
          {title}
        </h3>
        <p className="app-state-text" data-fallback={body ? undefined : ""}>
          {body}
        </p>
      </div>
      <div className="app-state-actions">{children}</div>
    </div>
  );
}
/** "Can't reach the shop" with Retry (the widget re-sends what was typed). */
export function Offline({ form, step }: { form: AppForm; step?: string }) {
  const content = (
    <>
      <span className="app-state-icon tone-danger" aria-hidden="true">
        <StateIcon name="alertTriangle" size={26} />
      </span>
      <div>
        <h3 className="app-step-title" tabIndex={-1}>
          {words(form, "offlineTitle", "Can’t reach the server")}
        </h3>
        <p className="app-state-text">
          {words(form, "offlineBody", "Check your connection and try again.")}
        </p>
      </div>
      <button className="site-button" type="button" data-action="retry">
        <StateIcon name="refresh" size={16} />
        <span>Retry</span>
      </button>
    </>
  );
  return step ? (
    <div
      className="app-step app-card app-state"
      data-step={step}
      role="alert"
      hidden
    >
      {content}
    </div>
  ) : (
    <div className="app-offline app-state" role="alert" hidden>
      {content}
    </div>
  );
}
/** "Phone" → "number": what visitors call the value they type. */
const valueWord = (field: AppField) =>
  field.type === "phone" ? "number" : field.name.toLowerCase();

/** Skeletons while a step-by-step lookup loads. */
export function LookupLoading() {
  return (
    <div
      className="app-step app-bare"
      data-step="loading"
      key="loading"
      aria-busy="true"
      hidden
    >
      <p className="app-step-title sr-only" tabIndex={-1}>
        Loading…
      </p>
      <div className="app-card app-skeletons" aria-hidden="true">
        <span className="app-skeleton is-block" />
        <span className="app-skeleton-row">
          <span className="app-skeleton is-avatar" />
          <span className="app-skeleton-lines">
            <span className="app-skeleton is-title" />
            <span className="app-skeleton is-short" />
          </span>
        </span>
      </div>
      <div className="app-card app-skeletons" aria-hidden="true">
        <span className="app-skeleton is-title" />
        <span className="app-skeleton" />
        <span className="app-skeleton" />
        <span className="app-skeleton is-short" />
      </div>
    </div>
  );
}
/** What a step-by-step lookup found: the person, a highlighted total, tiles and history. */
export function FlowResult({
  table,
  form,
  history,
  links,
  word,
}: {
  table: AppTable;
  form: AppForm;
  history: AppTable | undefined;
  links: AppLinks;
  /** What visitors call the value they typed, e.g. "number". */
  word: string;
}) {
  return (
    <>
      <div className="app-person">
        <span className="app-avatar is-xl" aria-hidden="true" />
        <div className="app-person-copy">
          <h3 className="app-step-title app-person-name" tabIndex={-1} />
          <p
            className="app-person-meta"
            data-since={`${table.singular.toLowerCase()} since`}
          />
        </div>
      </div>
      <div className="app-panel" hidden>
        <p className="app-panel-label" />
        <p className="app-panel-value" />
        <p className="app-panel-meta" hidden />
      </div>
      <dl className="app-record-fields" />
      <div className="app-tiles" hidden />
      {history && (
        <section className="app-card app-history is-card">
          <div className="app-card-header">
            <h4>{words(form, "historyTitle", history.name)}</h4>
            {links.submit && (
              <a className="site-button app-small" href={links.submit.href}>
                <Icon name="plus" size={15} />
                <span>New</span>
              </a>
            )}
          </div>
          <div className="app-card-body">
            <ol className="app-timeline is-rich" />
            <div className="app-history-empty app-state" hidden>
              <span className="app-state-icon tone-brand" aria-hidden="true">
                <Icon name="receipt" size={26} />
              </span>
              <div>
                <h5 className="app-state-title">
                  {words(form, "emptyTitle", "Nothing yet")}
                </h5>
                {form.copy?.emptyBody?.trim() && (
                  <p className="app-state-text">{form.copy.emptyBody.trim()}</p>
                )}
              </div>
              {links.submit && (
                <a className="site-button" href={links.submit.href}>
                  <Icon name="plus" size={16} />
                  <span>{links.submit.label}</span>
                </a>
              )}
            </div>
          </div>
        </section>
      )}
      <div className="app-actions app-center">
        <button className="app-ghost" type="button" data-action="refresh">
          <StateIcon name="refresh" size={15} />
          Refresh
        </button>
        <button className="app-ghost" type="button" data-action="change">
          Check a different {word}
        </button>
      </div>
      <div className="app-icons" hidden>
        {[
          "check",
          "x",
          "clock",
          "checkCircle",
          "xCircle",
          "receipt",
          "chart",
        ].map((name) => (
          <span key={name} data-icon={name}>
            <StateIcon name={name} size={name.length > 5 ? 18 : 14} />
          </span>
        ))}
      </div>
    </>
  );
}
/** A step-by-step lookup's screens for unknown and paused accounts and no connection. */
export function LookupScreens({
  form,
  keyField: key,
}: {
  form: AppForm;
  keyField: AppField;
}) {
  const word = valueWord(key);
  return (
    <>
      <StateScreen
        key="notfound"
        step="notfound"
        icon="alertCircle"
        tone="neutral"
        title={words(
          form,
          "notFoundTitle",
          key.type === "phone"
            ? "This number isn’t registered"
            : `We couldn’t find that ${key.name.toLowerCase()}`,
        )}
        body={form.copy?.notFoundBody?.trim() ?? ""}
      >
        <button className="site-button" type="button" data-action="change">
          <span>Try another {word}</span>
        </button>
      </StateScreen>
      <StateScreen
        key="paused"
        step="paused"
        icon="xCircle"
        tone="neutral"
        title={words(form, "pausedTitle", "This account is paused")}
        body={form.copy?.pausedBody?.trim() ?? ""}
      >
        <button
          className="site-button is-secondary"
          type="button"
          data-action="change"
        >
          <span>Try another {word}</span>
        </button>
      </StateScreen>
      <Offline key="offline" form={form} step="offline" />
    </>
  );
}
/** "Is this you?": the initials, name and details the widget fills in. */
export function IdentityCard() {
  return (
    <div className="app-identity">
      <span className="app-avatar is-lg" aria-hidden="true" />
      <span className="app-identity-copy">
        <span className="app-identity-name" />
        <span className="app-identity-meta" />
        <span className="app-identity-detail" hidden />
      </span>
    </div>
  );
}
/** Screens for an unknown or paused account after the identify step. */
export function IdentifyScreens({
  form,
  who,
}: {
  form: AppForm;
  who: AppField;
}) {
  const word = valueWord(who);
  return (
    <>
      <StateScreen
        key="notfound"
        step="notfound"
        icon="alertCircle"
        tone="danger"
        title={words(
          form,
          "notFoundTitle",
          who.type === "phone"
            ? "This number isn’t registered"
            : `We couldn’t find that ${who.name.toLowerCase()}`,
        )}
        body={form.copy?.notFoundBody?.trim() ?? ""}
      >
        <button className="site-button" type="button" data-action="change">
          <span>Try another {word}</span>
        </button>
      </StateScreen>
      <StateScreen
        key="paused"
        step="paused"
        icon="xCircle"
        tone="neutral"
        title={words(form, "pausedTitle", "This account is paused")}
        body={form.copy?.pausedBody?.trim() ?? ""}
      >
        <button
          className="site-button is-secondary"
          type="button"
          data-action="change"
        >
          <span>Try another {word}</span>
        </button>
      </StateScreen>
    </>
  );
}
/** Payment after sending: UPI, online checkout or instructions, and a status check. */
export function PayStep() {
  return (
    <div className="app-step app-pay" data-step="pay" hidden>
      <h3 className="app-step-title" tabIndex={-1}>
        Complete your payment
      </h3>
      <p className="app-pay-message" />
      <dl className="app-pay-summary">
        <div>
          <dt>Amount</dt>
          <dd className="app-pay-amount" />
        </div>
        <div>
          <dt>Reference</dt>
          <dd className="app-pay-reference" />
        </div>
      </dl>
      <div className="app-pay-options">
        <a className="site-button app-pay-upi" href="#pay" hidden>
          <span>Pay with UPI</span>
          <Icon name="arrow" size={16} />
        </a>
        <p className="app-pay-desktop" hidden>
          On a computer? Pay from any UPI app to{" "}
          <strong className="app-pay-upi-id" />, or open this page on your
          phone.
        </p>
        <a className="site-button app-pay-online" href="#pay" hidden>
          <span>Pay online</span>
          <Icon name="arrow" size={16} />
        </a>
        <p className="app-pay-instructions" hidden />
      </div>
      <p className="app-pay-state" role="status" />
      <div className="app-actions">
        <button
          className="site-button app-pay-check"
          type="button"
          data-action="paid"
        >
          <span>I’ve paid — check status</span>
          <Icon name="check" size={16} />
        </button>
        <button className="app-link" type="button" data-action="again">
          Done
        </button>
      </div>
    </div>
  );
}
/** What a lookup found: the record, its progress, order, totals and history. */
export function PlainResult({
  table,
  form,
  history,
  list,
  byRef,
  keyField: key,
}: {
  table: AppTable;
  form: AppForm;
  history: AppTable | undefined;
  /** The key isn't unique: the visitor's records are listed. */
  list: boolean;
  byRef: boolean;
  keyField: AppField;
}) {
  return (
    <>
      <div className="app-result-head">
        <h3
          className="app-step-title"
          tabIndex={-1}
          data-label={
            list ? `Your ${table.name.toLowerCase()}` : table.singular
          }
        >
          {list ? `Your ${table.name.toLowerCase()}` : table.singular}
        </h3>
        <span className="app-pill app-result-status" hidden />
      </div>
      <p className="app-result-note" hidden />
      <ol className="app-steps" aria-label="Progress" hidden />
      <div className="app-lines-box" hidden>
        <h4>Your order</h4>
        <ul className="app-lines" />
      </div>
      <dl className="app-record-fields" />
      <div className="app-totals" />
      {(history || list) && (
        <section className="app-history">
          {history && <h4>{words(form, "historyTitle", history.name)}</h4>}
          <ol className="app-timeline" />
          <p className="app-history-empty" hidden>
            {words(form, "emptyTitle", "Nothing yet.")}
          </p>
        </section>
      )}
      <div className="app-actions">
        <button className="app-link" type="button" data-action="refresh">
          Refresh
        </button>
        <button className="app-link" type="button" data-action="change">
          {byRef
            ? "Track another"
            : `Look up another ${key.name.toLowerCase()}`}
        </button>
      </div>
    </>
  );
}
/** The working part of an app section (the heading is the section's). */
export function AppFormMarkup({
  app,
  form,
  appApi,
  mode,
  prefix,
  collections = [],
  links = {},
  custom = {},
}: {
  app: App;
  form: AppForm;
  appApi?: string;
  mode: AppSectionMode;
  /** A classic-look form block's own words and blocks. */
  custom?: FormCustom;
  /** Makes ids unique on the page (the section id). */
  prefix: string;
  /** The site's collections, which "item" and "items" fields choose from. */
  collections?: Collection[];
  /** Pages the success screen and the lookup's history link to. */
  links?: AppLinks;
}) {
  const table = tableOf(app, form.table);
  if (!table) return null;
  const live = mode === "live" && !!appApi;
  const disabled = !live;
  const p = `app-${prefix}`;
  const catalog = makeCatalog(collections);
  const rupees = app.currency === "INR";
  const said = custom.words ?? {};
  const pick = (key: string) => custom.attrs?.(key);
  const say: Say = (key, shown) =>
    custom.text ? custom.text(key, shown) : shown;
  /** A field's label and hint, by the field's key. */
  const sayField =
    (key: string): Say =>
    (part, shown) =>
      say(`${part}:${key}`, shown);
  /** A step's title and lead, by their copy keys. */
  const sayStep =
    (title: FormCopyKey, lead: FormCopyKey): Say =>
    (part, shown) =>
      say(part === "title" ? title : lead, shown);
  const button = (
    label: string,
    icon = "arrow",
    wide = false,
    key = "button",
  ) => (
    <button
      {...pick(key)}
      className={`site-button app-submit ${wide ? "app-block" : ""}`}
      type="submit"
      disabled={disabled}
    >
      <span>{say(key, label || "Send")}</span>
      <StateIcon name={icon} size={wide ? 18 : 16} />
    </button>
  );
  const note = !live && (
    <p className="app-preview-note">
      <Icon name="lock" size={13} />
      {mode === "export"
        ? "Works when published with Forma."
        : "Works on your published site."}
    </p>
  );
  /** The small line under a first step's button. */
  const identifyNote = form.copy?.identifyNote?.trim() && (
    <p className="app-note">
      <StateIcon name="shield" size={14} />
      {say("identifyNote", form.copy.identifyNote.trim())}
    </p>
  );
  const steps: ReactNode[] = [];
  let capacity: string | undefined;
  let flow = false;
  let wizard: ReactNode = null;
  if (form.kind === "lookup") {
    const byRef = form.key === REF_KEY;
    const key: AppField | undefined = byRef
      ? {
          id: REF_KEY,
          name: "Reference number",
          type: "text",
          required: true,
          options: [],
        }
      : fieldOf(table, form.key ?? "");
    if (!key) return null;
    const verify =
      form.verify && form.verify !== form.key
        ? fieldOf(table, form.verify)
        : undefined;
    const list = !byRef && !key.unique;
    const history = form.history && tableOf(app, form.history.table);
    // One record by a unique value, with a highlighted total: the rewards page.
    flow = !byRef && !list && !!form.highlight;
    const lit = flow
      ? table.totals.find((t) => t.id === form.highlight)
      : undefined;
    const keyLook: FieldLook | undefined = flow
      ? {
          large: true,
          mobile: key.type === "phone" && rupees,
          prefix: key.type === "phone" && rupees ? "+91" : undefined,
        }
      : undefined;
    const keyInput = (
      <FieldInput
        field={key}
        prefix={p}
        disabled={disabled}
        name="value"
        catalog={catalog}
        placeholder={byRef ? `${table.prefix}-1001` : undefined}
        look={keyLook}
        attrs={pick("value")}
        say={sayField("value")}
      />
    );
    steps.push(
      <form
        className={`app-step ${flow ? "app-card" : ""}`}
        data-step="lookup"
        key="lookup"
        noValidate
      >
        {flow && (
          <StepHead
            title={words(form, "identifyTitle", "")}
            lead={form.copy?.identifyIntro?.trim()}
            say={sayStep("identifyTitle", "identifyIntro")}
          />
        )}
        {verify ? (
          <div className="app-fields">
            {keyInput}
            <FieldInput
              field={verify}
              prefix={p}
              disabled={disabled}
              name="verify"
              catalog={catalog}
              attrs={pick("verify")}
              say={sayField("verify")}
            />
          </div>
        ) : (
          keyInput
        )}
        {custom.extras?.lookup}
        <ErrorLine />
        {button(
          form.button || (byRef ? "Track" : "Look up"),
          flow ? (lit?.money ? "wallet" : "search") : "arrow",
          flow,
        )}
        {flow && identifyNote}
      </form>,
    );
    if (live && flow) {
      steps.push(
        <LookupLoading key="loading" />,
        <div
          className="app-step app-bare"
          data-step="result"
          key="result"
          hidden
        >
          <FlowResult
            table={table}
            form={form}
            history={history || undefined}
            links={links}
            word={valueWord(key)}
          />
        </div>,
        <LookupScreens key="screens" form={form} keyField={key} />,
      );
    } else if (live)
      steps.push(
        <div className="app-step" data-step="result" key="result" hidden>
          <PlainResult
            table={table}
            form={form}
            history={history || undefined}
            list={list}
            byRef={byRef}
            keyField={key}
          />
        </div>,
      );
  } else {
    const parent = form.identify && tableOf(app, form.identify.table);
    const who = parent && fieldOf(parent, form.identify!.field);
    const fields = form.fields
      .map((id) => fieldOf(table, id))
      .filter((f): f is AppField => !!f && !f.ownerOnly && f.type !== "link");
    const pickers = fields.filter((f) => f.type === "items");
    const rest = fields.filter((f) => f.type !== "items");
    const cart = pickers[0];
    // Identify, confirm, details with a step indicator: the purchase form.
    flow = !!who && !!form.steps && !pickers.length;
    const symbol = currencySymbol(app.currency);
    const fieldLook = (f: AppField): FieldLook | undefined =>
      flow
        ? {
            tall: true,
            ...(f.type === "money" ? { money: true, prefix: symbol } : {}),
            ...(f.type === "phone" && rupees
              ? { mobile: true, prefix: "+91" }
              : {}),
          }
        : undefined;
    if (flow && form.steps)
      wizard = (
        <ol className="app-wizard" aria-label="Progress">
          {form.steps.map((label, index) => (
            <li className="app-wizard-item" key={index}>
              {index > 0 && (
                <span
                  className="app-wizard-bar"
                  data-wizard-bar={index + 1}
                  data-state="todo"
                  aria-hidden="true"
                />
              )}
              <span
                className="app-wizard-step"
                data-wizard={index + 1}
                data-state={index === 0 ? "active" : "todo"}
                aria-current={index === 0 ? "step" : undefined}
              >
                <span className="app-wizard-dot" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="app-wizard-label">{label}</span>
              </span>
            </li>
          ))}
        </ol>
      );
    const whoLine =
      who &&
      (flow ? (
        <p className="app-lead app-who">
          {words(form, "fieldsIntro", "Sending as")}{" "}
          <strong className="app-who-name" />
          <span className="app-who-meta" />
        </p>
      ) : (
        <p className="app-who">
          <span className="app-who-name" />
          <button className="app-link" type="button" data-action="change">
            Not you?
          </button>
        </p>
      ));
    const caps = (table.capacity ?? [])
      .filter((c) => c.group.some((g) => form.fields.includes(g)))
      .map((c) => ({
        id: c.id,
        group: c.group,
        size: c.size && form.fields.includes(c.size) ? c.size : undefined,
        unit: c.size
          ? (fieldOf(table, c.size)?.name.toLowerCase() ?? "places")
          : "places",
        message: c.message,
      }));
    if (live && caps.length) capacity = JSON.stringify(caps);
    if (who) {
      const word = valueWord(who);
      steps.push(
        <form
          className={`app-step ${flow ? "app-card" : ""}`}
          data-step="identify"
          key="identify"
          noValidate
        >
          {flow && (
            <StepHead
              title={words(
                form,
                "identifyTitle",
                who.type === "phone"
                  ? "What’s your phone number?"
                  : `What’s your ${who.name.toLowerCase()}?`,
              )}
              lead={form.copy?.identifyIntro?.trim()}
              say={sayStep("identifyTitle", "identifyIntro")}
            />
          )}
          <FieldInput
            field={who}
            prefix={p}
            disabled={disabled}
            name="identity"
            catalog={catalog}
            attrs={pick("identity")}
            say={sayField("identity")}
            look={
              flow
                ? {
                    large: true,
                    ...(who.type === "phone" && rupees
                      ? { mobile: true, prefix: "+91" }
                      : {}),
                  }
                : undefined
            }
          />
          {custom.extras?.identify}
          <ErrorLine />
          {button(said.continue || "Continue", "arrow", flow, "continue")}
          {flow && identifyNote}
          {live && flow && <Offline form={form} />}
        </form>,
      );
      if (live && flow)
        steps.push(
          <div
            className="app-step app-card"
            data-step="confirm"
            key="confirm"
            hidden
          >
            <StepHead
              title={words(form, "confirmTitle", "Is this you?")}
              lead={words(
                form,
                "confirmIntro",
                "Confirm it’s you before you continue.",
              )}
            />
            <IdentityCard />
            <button
              className="site-button app-block"
              type="button"
              data-action="confirm"
            >
              <span>{said.confirm || "Yes, continue"}</span>
            </button>
            <button
              className="app-ghost app-block"
              type="button"
              data-action="change"
            >
              <StateIcon name="arrowLeft" size={16} />
              {said.change || `Use a different ${word}`}
            </button>
          </div>,
          <IdentifyScreens key="screens" form={form} who={who} />,
        );
      else if (live)
        steps.push(
          <div className="app-step" data-step="confirm" key="confirm" hidden>
            <h3 className="app-step-title" tabIndex={-1}>
              {words(form, "confirmTitle", "Is this you?")}
            </h3>
            <dl className="app-match" />
            <div className="app-actions">
              <button
                className="site-button"
                type="button"
                data-action="confirm"
              >
                <span>{said.confirm || "Yes, that’s me"}</span>
                <Icon name="check" size={16} />
              </button>
              <button className="app-link" type="button" data-action="change">
                {said.change || `No, change ${who.name.toLowerCase()}`}
              </button>
            </div>
          </div>,
        );
    }
    if (pickers.length && (live || !who))
      steps.push(
        <div
          className="app-step app-menu-step"
          data-step="menu"
          key="menu"
          hidden={(live && !!who) || undefined}
        >
          {whoLine}
          {pickers.map((f) => (
            <Picker
              key={f.id}
              field={f}
              prefix={p}
              disabled={disabled}
              catalog={catalog}
            />
          ))}
          <div className="app-cartbar" hidden={live || undefined}>
            <span className="app-cartbar-summary">
              <span className="app-cartbar-count">Your order</span>
              <strong className="app-cartbar-total" />
            </span>
            <button
              className="site-button"
              type="button"
              data-action="checkout"
              disabled={disabled || undefined}
            >
              <span>{rest.length ? "View order" : "Review order"}</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {live && (
            <noscript>
              <p className="app-preview-note">
                Turn on JavaScript in your browser to order.
              </p>
            </noscript>
          )}
        </div>,
      );
    if (live || (!who && !pickers.length))
      steps.push(
        <form
          className={`app-step ${flow ? "app-card" : ""}`}
          data-step="fields"
          key="fields"
          noValidate
          hidden={(live && (!!who || !!pickers.length)) || undefined}
        >
          {flow ? (
            <div className="app-step-head">
              <h3 className="app-step-title" tabIndex={-1}>
                {say("fieldsTitle", words(form, "fieldsTitle", "Your details"))}
              </h3>
              {whoLine}
            </div>
          ) : (
            !pickers.length && whoLine
          )}
          {cart && (
            <div
              className="app-cart"
              data-field={cart.id}
              tabIndex={-1}
              aria-describedby={`${p}-${cart.id}-error`}
            >
              <div className="app-cart-head">
                <h3 className="app-step-title" tabIndex={-1}>
                  Your order
                </h3>
                <button className="app-link" type="button" data-action="menu">
                  Add more
                </button>
              </div>
              <ul className="app-cart-lines" />
              <p className="app-cart-empty" hidden>
                Nothing added yet.
              </p>
              <div className="app-cart-total">
                <span>Subtotal</span>
                <strong className="app-cart-sum" />
              </div>
              <small className="app-cart-note">
                We confirm the final total when you place the order.
              </small>
              <small
                className="app-field-error"
                id={`${p}-${cart.id}-error`}
                hidden
              />
            </div>
          )}
          {rest.length > 0 && (
            <div className="app-fields">
              {rest.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  prefix={p}
                  disabled={disabled}
                  catalog={catalog}
                  look={fieldLook(f)}
                  attrs={pick(f.id)}
                  say={sayField(f.id)}
                />
              ))}
            </div>
          )}
          {capacity && <p className="app-places" aria-live="polite" hidden />}
          {custom.extras?.fields}
          <label className="site-request-trap" aria-hidden="true">
            Leave empty
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          <ErrorLine />
          {button(
            form.button || (cart ? "Place order" : "Send"),
            flow ? "send" : "arrow",
            flow,
          )}
          {flow && form.copy?.fieldsNote?.trim() && (
            <p className="app-info">
              <StateIcon name="info" size={16} />
              <span>{say("fieldsNote", form.copy.fieldsNote.trim())}</span>
            </p>
          )}
        </form>,
      );
    if (live && form.payment) steps.push(<PayStep key="pay" />);
    if (live && flow)
      steps.push(
        <div
          className="app-step app-card app-state app-done"
          data-step="done"
          key="done"
          hidden
        >
          <span className="app-state-icon tone-success" aria-hidden="true">
            <StateIcon name="checkCircle" size={28} />
          </span>
          <div>
            <h3 className="app-step-title" tabIndex={-1}>
              {words(form, "doneTitle", "Sent")}
            </h3>
            <p className="app-state-text app-done-text" />
          </div>
          <span
            className="app-pill app-done-badge"
            data-badge={form.copy?.doneBadge?.trim() || undefined}
            hidden
          />
          <div className="app-state-actions">
            {links.lookup && (
              <a className="site-button" href={links.lookup.href}>
                <span>{links.lookup.label}</span>
              </a>
            )}
            <button
              className="site-button is-secondary"
              type="button"
              data-action="again"
            >
              <span>{said.again || "Record another"}</span>
            </button>
          </div>
        </div>,
      );
    else if (live)
      steps.push(
        <div className="app-step app-done" data-step="done" key="done" hidden>
          <span className="app-done-icon" aria-hidden="true">
            <Icon name="check" size={22} />
          </span>
          <p className="app-done-text" tabIndex={-1} />
          <button className="app-link" type="button" data-action="again">
            {said.again || (cart ? "Place another order" : "Send another")}
          </button>
        </div>,
      );
  }
  return (
    <div
      className={`app-form ${live ? "" : "is-preview"} ${flow ? "is-flow" : ""}`}
      data-app-api={live ? appApi : undefined}
      data-form={live ? form.id : undefined}
      data-kind={form.kind}
      data-identify={form.identify ? "" : undefined}
      data-flow={flow ? "" : undefined}
      data-capacity={capacity}
    >
      {wizard}
      {steps}
      {note}
      <p className="app-status sr-only" aria-live="polite" />
    </div>
  );
}
