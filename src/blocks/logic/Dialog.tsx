/**
 * The dialog block. On the site: a closed <dialog> the logic script opens
 * (runtime.ts). In the editor: a strip saying it's there (select it to edit),
 * drawn open over a dimmed band while it or a block inside it is selected.
 * In Preview: opened and closed by React (usePageLogic).
 */
import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { Icon } from "../../studio/Icon";
import { contains, type Node, type PropValue } from "../model";
import type { RenderContext } from "../render";
import { dialogId } from "./model";
import { logicOf } from "./blocks";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
type Attrs = Record<string, string | undefined>;

/**
 * A dialog block. On the site: a closed <dialog> the logic script opens.
 * In the editor: a strip saying it's there (select it to edit), drawn open
 * over a dimmed band while it or a block inside it is selected.
 */
export function DialogBlock({
  node: n,
  ctx,
  className,
  attrs,
  children,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Attrs;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const logic = logicOf(ctx);
  const open = !ctx.edit && !ctx.exporting && logic.open === n.id;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  const id = dialogId(n.id);
  const kind = str(n.props.kind) === "drawer" ? "drawer" : "modal";
  const size = ["sm", "md", "lg"].includes(str(n.props.size))
    ? str(n.props.size)
    : "md";
  const title = str(n.props.title);
  const classes = `${className} k-${kind} s-${size}`;
  if (ctx.miniature) return null;
  const edit = ctx.edit;
  if (edit) {
    const inside = !!edit.selected && contains(n, edit.selected);
    if (!inside)
      return (
        <div
          data-node-id={n.id}
          data-node-type={n.type}
          className="blk-dialog-chip"
        >
          <Icon name="window" size={15} />
          <strong>{title || "Dialog"}</strong>
          <span>
            {kind === "drawer" ? "Side panel" : "Pop-up"} · opens when clicked.
            Select to edit.
          </span>
        </div>
      );
    return (
      <div className={`blk-dialog-stage k-${kind}`}>
        <span className="blk-dialog-stage-label">
          <Icon name="window" size={13} />
          {kind === "drawer" ? "Side panel" : "Pop-up"} · only shown when opened
        </span>
        <div
          {...attrs}
          className={`${classes} is-editing`}
          role="dialog"
          aria-label={title || "Dialog"}
        >
          <p className="blk-dialog-title">{title || "Dialog"}</p>
          <span className="blk-dialog-close" aria-hidden="true">
            <Icon name="x" size={18} />
          </span>
          {children}
        </div>
      </div>
    );
  }
  return (
    <dialog
      ref={ref}
      {...attrs}
      id={id}
      className={classes}
      aria-labelledby={`${id}-title`}
      data-dialog=""
      onClose={open ? logic.onClose : undefined}
      onClick={
        open
          ? (e: ReactMouseEvent<HTMLDialogElement>) => {
              // A click on the dimmed backdrop (the dialog itself) closes it.
              if (e.target === e.currentTarget) logic.onClose?.();
            }
          : undefined
      }
    >
      <h2 className="blk-dialog-title" id={`${id}-title`}>
        {title}
      </h2>
      <button
        type="button"
        className="blk-dialog-close"
        data-dialog-close=""
        aria-label="Close"
      >
        <Icon name="x" size={18} />
      </button>
      {children}
      {open && logic.toast}
    </dialog>
  );
}
