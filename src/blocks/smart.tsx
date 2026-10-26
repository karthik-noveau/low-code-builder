/**
 * Smart blocks: forms and data that plain blocks can't express yet. They draw
 * the same markup as the classic sections (src/studio/siteParts.tsx), so the
 * published page's scripts and the inbox keep working. Phases 3–4 replace
 * them with form and data blocks.
 */
import { Icon } from "../studio/Icon";
import { AppFormArea, CollectionCards, SiteForm } from "../studio/siteParts";
import { appSectionProblem } from "../apps/issues";
import type { Node, PropValue } from "./model";
import { Placeholder, type RenderContext } from "./render";
import { lines } from "./text";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
const num = (v: PropValue | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

export function SmartBlock({
  node: n,
  ctx,
  className,
  attrs,
}: {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Record<string, string | undefined>;
}) {
  const p = n.props;
  const editing = !!ctx.edit;
  const hint = (icon: string, title: string, action: string) =>
    editing ? (
      <Placeholder
        icon={icon}
        title={title}
        action={action}
        attrs={attrs}
        className={className}
      />
    ) : null;
  switch (n.type) {
    // The bar itself is drawn at the bottom of the page (Website.tsx).
    // In the editor it shows a note only while selected (from Layers), so it
    // doesn't sit in the header's layout.
    case "tabBar":
      return ctx.edit?.selected === n.id ? (
        <span {...attrs} className={`${className} blk-hint`}>
          <Icon name="menu" size={14} />
          {`Phone tab bar: ${lines(p.tabs).length || "every page"}${lines(p.tabs).length ? " tabs" : ""}, shown at the bottom on phones`}
        </span>
      ) : null;
    case "contactForm":
    case "newsletter":
      return (
        <SiteForm
          kind={n.type === "contactForm" ? "contact" : "newsletter"}
          buttonLabel={str(p.label)}
          formAction={str(p.action)}
          inbox={ctx.inbox}
          editing={editing}
          exporting={ctx.exporting}
          className={className}
          attrs={attrs}
        />
      );
    case "appForm": {
      if (editing && !ctx.project.app?.forms.some((f) => f.id === str(p.form)))
        return hint(
          "activity",
          "App form",
          ctx.project.app?.forms.length
            ? "Choose which form to show in the panel on the right."
            : "Set up your business app first (App in the left panel).",
        );
      const area = (
        <AppFormArea
          project={ctx.project}
          formId={str(p.form)}
          prefix={n.id}
          pageName={ctx.page?.name}
          heading={p.heading !== false}
          main={str(p.level) === "1"}
          exporting={ctx.exporting}
          appApi={ctx.appApi}
          href={ctx.href}
        />
      );
      // Published pages show nothing for a form that's gone.
      if (
        ctx.exporting &&
        (appSectionProblem(ctx.project.app, str(p.form)) ||
          !ctx.project.app?.forms.some((f) => f.id === str(p.form)))
      )
        return null;
      return (
        <div {...attrs} className={className}>
          {area}
        </div>
      );
    }
    case "collectionList": {
      const c = ctx.project.collections?.find(
        (x) => x.id === str(p.collection),
      );
      if (!c)
        return hint(
          "grid",
          "Collection list",
          ctx.project.collections?.length
            ? "Choose a collection in the panel on the right."
            : "Add a collection first (Data in the left panel).",
        );
      return (
        <div {...attrs} className={className}>
          <CollectionCards
            collection={c}
            listing={{
              collection: c.id,
              style: str(p.style) === "list" ? "list" : "grid",
              columns: Math.max(1, Math.min(4, num(p.columns, 3))),
              limit: Math.max(0, num(p.limit, 0)),
            }}
            exporting={ctx.exporting}
            editing={editing}
            href={ctx.href}
          />
        </div>
      );
    }
    default:
      return null;
  }
}
