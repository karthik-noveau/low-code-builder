/**
 * The owner app's building blocks, matching the Dhanlaxmi reference
 * components (Button, Card, StatCard, Modal, Drawer, Tabs, Pagination…).
 * Class names are "ow-" prefixed and styled in owner.css.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { useDialog } from "../apps/app-helpers";
import { Icon, type IconName } from "./Icon";
import { initialsOf } from "./format";
import { ToastContext, type ToastItem, type ToastTone } from "./toast";

const cx = (...names: (string | false | undefined | null)[]) =>
  names.filter(Boolean).join(" ");

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "success" | "danger" | "dangerQuiet";
interface ButtonLook {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  block?: boolean;
  iconOnly?: boolean;
}
const buttonClass = ({ variant, size, block, iconOnly }: ButtonLook) =>
  cx(
    "ow-btn",
    variant && `ow-btn-${variant}`,
    size === "sm" && "ow-btn-sm",
    size === "lg" && "ow-btn-lg",
    block && "ow-btn-block",
    iconOnly && (size === "sm" ? "ow-btn-iconSm" : "ow-btn-icon"),
  );

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  iconOnly,
  loading,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonLook & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={cx(buttonClass({ variant, size, block, iconOnly }), className)}
      data-loading={loading ? "true" : undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className="ow-spinner" aria-hidden="true" />
      ) : icon ? (
        <Icon name={icon} size={size === "sm" ? 16 : 16} />
      ) : null}
      {children !== undefined && children !== null && (
        <span className="ow-btnLabel">{children}</span>
      )}
    </button>
  );
}
/** A link that looks like a button; `onGo` keeps the owner app on the page. */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  block,
  className,
  children,
  onGo,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonLook & { onGo?: () => void }) {
  return (
    <a
      className={cx(buttonClass({ variant, size, block }), className)}
      onClick={
        onGo
          ? (e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
                return;
              e.preventDefault();
              onGo();
            }
          : undefined
      }
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      <span className="ow-btnLabel">{children}</span>
    </a>
  );
}
/** A plain in-app link. */
export function GoLink({
  onGo,
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { onGo: () => void }) {
  return (
    <a
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onGo();
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export type BadgeTone =
  "pending" | "approved" | "rejected" | "neutral" | "brand" | "info";
export function Badge({
  tone = "neutral",
  dot,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`ow-badge ow-badge-${tone}`}>
      {dot && <span className="ow-badgeDot" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Avatar({
  name,
  size = "sm",
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <span className={`ow-avatar ow-avatar-${size}`} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
export function Identity({
  name,
  meta,
  size = "sm",
}: {
  name: string;
  meta?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="ow-identity">
      <Avatar name={name} size={size} />
      <div className="ow-identityText">
        <p className="ow-identityName">{name}</p>
        {meta ? <p className="ow-identityMeta">{meta}</p> : null}
      </div>
    </div>
  );
}

export function Card({
  children,
  padded,
  className,
  labelledBy,
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <section
      className={cx("ow-card", padded && "ow-cardPad", className)}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  );
}
export function CardHeader({
  title,
  id,
  description,
  badge,
  actions,
  icon,
}: {
  title: string;
  id?: string;
  description?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="ow-cardHeader">
      {icon}
      <div className="ow-cardHeaderText">
        <h3 className="ow-sectionTitle" id={id}>
          {title}
        </h3>
        {description && <p className="ow-subtle">{description}</p>}
      </div>
      {badge}
      <div className="ow-spacer" />
      {actions && <div className="ow-cardActions">{actions}</div>}
    </div>
  );
}
export function CardBody({
  children,
  flush,
}: {
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <div className={cx("ow-cardBody", flush && "ow-cardBodyFlush")}>
      {children}
    </div>
  );
}
export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="ow-cardFooter">{children}</div>;
}

export type StatTone = "plain" | "accent" | "slate" | "dark";
export function StatCard({
  tone,
  icon,
  label,
  value,
  meta,
}: {
  tone: StatTone;
  icon: IconName;
  label: string;
  value: string;
  meta?: ReactNode;
}) {
  return (
    <div className={`ow-stat ow-stat-${tone}`}>
      <div className="ow-statTop">
        <span className="ow-statIcon" aria-hidden="true">
          <Icon name={icon} />
        </span>
        <p className="ow-statLabel">{label}</p>
      </div>
      <p className="ow-statValue">{value}</p>
      {meta ? <p className="ow-statMeta">{meta}</p> : null}
    </div>
  );
}
/** The small tinted icon square used in headers and dialogs. */
export function IconTile({
  icon,
  tone = "brand",
}: {
  icon: IconName;
  tone?: "brand" | "success" | "danger" | "info" | "warning" | "muted";
}) {
  return (
    <span className={`ow-tile ow-tile-${tone}`} aria-hidden="true">
      <Icon name={icon} />
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="ow-pageHeader">
      <div className="ow-pageHeaderText">
        <h2 className="ow-pageTitle">{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions && <div className="ow-btnGroup">{actions}</div>}
    </div>
  );
}

export interface FieldProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}
export function Field({
  label,
  hint,
  error,
  optional,
  counter,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  counter?: string;
  children: (props: FieldProps) => ReactNode;
}) {
  const id = useId();
  const described = [error && `${id}-error`, hint && `${id}-hint`]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="ow-field" data-invalid={error ? "true" : "false"}>
      <label className="ow-label" htmlFor={id}>
        {label}
        {optional && <span className="ow-labelOptional"> (optional)</span>}
      </label>
      {children({
        id,
        ...(described ? { "aria-describedby": described } : {}),
        ...(error ? { "aria-invalid": true } : {}),
      })}
      {error && (
        <p className="ow-fieldError" id={`${id}-error`} role="alert">
          <Icon name="alertCircle" size={14} />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && (
        <p className="ow-fieldHint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {counter && <p className="ow-charCount">{counter}</p>}
    </div>
  );
}
export function Input({
  prefix,
  suffix,
  large,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  prefix?: string;
  suffix?: string;
  large?: boolean;
}) {
  const input = (
    <input
      className={cx(
        "ow-input",
        large && "ow-inputLg",
        prefix && "ow-hasPrefix",
        suffix && "ow-hasSuffix",
        className,
      )}
      {...rest}
    />
  );
  if (!prefix && !suffix) return input;
  return (
    <div className="ow-inputGroup">
      {prefix && (
        <span className="ow-inputPrefix" aria-hidden="true">
          {prefix}
        </span>
      )}
      {input}
      {suffix && (
        <span className="ow-inputSuffix" aria-hidden="true">
          {suffix}
        </span>
      )}
    </div>
  );
}
/** A password input with a show / hide button. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  return (
    <div className="ow-inputGroup">
      <input
        className="ow-input ow-hasReveal"
        type={shown ? "text" : "password"}
        {...props}
      />
      <button
        type="button"
        className="ow-btn ow-btn-ghost ow-btn-iconSm ow-reveal"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        onClick={() => setShown((s) => !s)}
      >
        <Icon name={shown ? "eye" : "eyeOff"} size={16} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="ow-segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="ow-segmentedItem"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="ow-switch ow-switchSpread">
      <span>
        <span className="ow-switchLabel">{label}</span>
        {description && <span className="ow-subtle">{description}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ow-switchTrack" aria-hidden="true">
        <span className="ow-switchThumb" />
      </span>
    </label>
  );
}

export function Tabs<T extends string>({
  label,
  value,
  tabs,
  onChange,
  idBase,
}: {
  label: string;
  value: T;
  tabs: { value: T; label: string; count?: number }[];
  onChange: (value: T) => void;
  idBase: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    refs.current[next]?.focus();
    onChange(tabs[next].value);
  };
  return (
    <div className="ow-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          type="button"
          id={`${idBase}-tab-${t.value}`}
          aria-controls={`${idBase}-panel`}
          aria-selected={value === t.value}
          tabIndex={value === t.value ? 0 : -1}
          className="ow-tab"
          onClick={() => onChange(t.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") move(i + 1);
            if (e.key === "ArrowLeft") move(i - 1);
          }}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ow-tabCount">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  // At most five numbered buttons around the current page.
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const numbers = Array.from(
    { length: Math.min(5, pages) },
    (_, i) => start + i,
  );
  return (
    <nav className="ow-pagination" aria-label="Pagination">
      <p className="ow-paginationInfo">{`Showing ${from}–${to} of ${total}`}</p>
      {onPageSize && (
        <label className="ow-pageSize">
          <span className="ow-srOnly">Rows per page</span>
          <select
            className="ow-select ow-selectCompact"
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
          >
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {`${n} per page`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="ow-paginationPages">
        <button
          type="button"
          className="ow-pageBtn"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <Icon name="chevronLeft" size={14} />
        </button>
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            className="ow-pageBtn"
            aria-current={n === page ? "page" : undefined}
            aria-label={`Page ${n}`}
            onClick={() => onPage(n)}
          >
            {n}
          </button>
        ))}
        <button
          type="button"
          className="ow-pageBtn"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
    </nav>
  );
}

export function SearchBox({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="ow-searchBox">
      <Icon name="search" size={16} />
      <label className="ow-srOnly" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ow-input"
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="ow-select ow-selectCompact"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function EmptyState({
  icon,
  tone = "brand",
  title,
  description,
  action,
}: {
  icon: IconName;
  tone?: "brand" | "success" | "neutral" | "danger";
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ow-state">
      <span className={`ow-stateIcon ow-stateIcon-${tone}`} aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <div>
        <p className="ow-stateTitle">{title}</p>
        {description && <p className="ow-stateText">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ow-state" role="alert">
      <span className="ow-stateIcon ow-stateIcon-danger" aria-hidden="true">
        <Icon name="alertTriangle" size={24} />
      </span>
      <div>
        <p className="ow-stateTitle">{title}</p>
        <p className="ow-stateText">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" icon="refresh" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Skeleton({
  shape = "text",
  width,
}: {
  shape?: "text" | "title" | "chip" | "avatar" | "block";
  width?: string;
}) {
  return (
    <span
      className={`ow-skeleton ow-skeleton-${shape}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}
export function SkeletonRows({
  label,
  rows = 4,
}: {
  label: string;
  rows?: number;
}) {
  return (
    <div className="ow-skeletonBody" aria-busy="true">
      <span className="ow-srOnly">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ow-skeletonRow">
          <Skeleton shape="avatar" />
          <Skeleton width="32%" />
          <Skeleton width="16%" />
          <Skeleton shape="chip" />
        </div>
      ))}
    </div>
  );
}

export function InlineAlert({
  tone = "info",
  icon,
  title,
  children,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  icon?: IconName;
  title?: string;
  children?: ReactNode;
}) {
  const fallback: Record<string, IconName> = {
    info: "info",
    success: "checkCircle",
    warning: "alertTriangle",
    danger: "alertCircle",
  };
  return (
    <div
      className={`ow-alert ow-alert-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <Icon name={icon ?? fallback[tone]} size={16} />
      <div className="ow-alertBody">
        {title && <p className="ow-alertTitle">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

export function DefinitionList({
  items,
}: {
  items: { term: string; value: ReactNode }[];
}) {
  return (
    <dl className="ow-dl">
      {items.map((item) => (
        <div key={item.term} className="ow-dlRow">
          <dt>{item.term}</dt>
          <dd>
            {item.value === null ||
            item.value === undefined ||
            item.value === "" ? (
              <span className="ow-subtle">—</span>
            ) : (
              item.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A centred dialog: focus moves in, Tab stays inside, Escape closes. */
export function Modal({
  title,
  description,
  icon,
  footer,
  onClose,
  children,
  urgent,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  urgent?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialog(ref, onClose);
  const id = useId();
  return (
    <div
      className="ow-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="ow-modal"
        role={urgent ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-desc` : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ow-modalHeader">
          {icon}
          <div className="ow-grow">
            <h2 className="ow-modalTitle" id={`${id}-title`}>
              {title}
            </h2>
            {description && (
              <p className="ow-modalDesc" id={`${id}-desc`}>
                {description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="x"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="ow-modalBody">{children}</div>
        {footer && <div className="ow-modalFooter">{footer}</div>}
      </div>
    </div>
  );
}
/** A side panel (a bottom sheet on phones). */
export function Drawer({
  title,
  description,
  icon,
  badge,
  footer,
  onClose,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useDialog(ref, onClose);
  const id = useId();
  return (
    <div
      className="ow-drawerOverlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="ow-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="ow-drawerHeader">
          {icon}
          <div className="ow-grow">
            <h2 className="ow-modalTitle" id={`${id}-title`}>
              {title}
            </h2>
            {description && <p className="ow-subtle">{description}</p>}
          </div>
          {badge}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon="x"
            aria-label="Close"
            onClick={onClose}
          />
        </div>
        <div className="ow-drawerBody">{children}</div>
        {footer && <div className="ow-drawerFooter">{footer}</div>}
      </div>
    </div>
  );
}

/** A small menu under a button; closes on outside click and Escape. */
export function Dropdown({
  label,
  trigger,
  align = "right",
  wide,
  onOpen,
  children,
}: {
  label: string;
  trigger: ReactNode;
  align?: "left" | "right";
  wide?: boolean;
  onOpen?: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="ow-dropdown" ref={ref} data-open={open}>
      <button
        type="button"
        className="ow-btn ow-btn-ghost ow-btn-icon ow-dropdownToggle"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cx(
            "ow-dropdownMenu",
            align === "left" && "ow-dropdownMenuLeft",
            wide && "ow-dropdownWide",
          )}
          role="menu"
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
export function MenuItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon?: IconName;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx("ow-dropdownItem", danger && "ow-dropdownItemDanger")}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

const TOAST_ICON: Record<ToastTone, IconName> = {
  success: "checkCircle",
  warning: "alertTriangle",
  error: "alertCircle",
  info: "info",
};
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const show = useCallback((tone: ToastTone, title: string, text?: string) => {
    const id = ++next.current;
    setToasts((all) => [...all.slice(-2), { id, tone, title, text }]);
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="ow-toastRegion" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`ow-toast ow-toast-${t.tone}`}>
            <span className="ow-toastIcon">
              <Icon name={TOAST_ICON[t.tone]} />
            </span>
            <div className="ow-toastBody">
              <p className="ow-toastTitle">{t.title}</p>
              {t.text && <p className="ow-toastText">{t.text}</p>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
