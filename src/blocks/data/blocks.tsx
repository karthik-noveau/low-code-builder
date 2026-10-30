/**
 * Data blocks: repeat (a template per item), stat, chart and table. The same
 * markup in the editor, the preview and the published site:
 * - collections are resolved while rendering, so published pages carry the
 *   items as plain HTML (search engines read them);
 * - app data (public views, public dashboard figures) shows the owner's real
 *   records in the editor (live.ts), and on a published page a loading
 *   skeleton plus the template, which the data script fills from the public
 *   API (runtime.ts). Contract with runtime.ts: `data-app-api`, `data-view`,
 *   `data-size`, `data-more`, `data-metric`, `data-chart` and the classes
 *   named there.
 */
import type { CSSProperties, ReactNode } from "react";
import { Icon } from "../../studio/Icon";
import { cardValue, tableOf, type App, type AppView } from "../../apps/model";
import type { PublicView } from "../../apps/api-types";
import { contains, type Node, type PropValue } from "../model";
import { NodeView, Placeholder, type RenderContext } from "../render";
import {
  collectionItem,
  parseSource,
  queryCollection,
  rowItem,
  type DataItem,
} from "./bind";
import { useStoreCatalog, useTableData } from "./live";
import { queryStore, SAMPLE_PRODUCTS, storeItem } from "./store";
import { chartPoints, runView, viewColumns, PAGE_SIZE } from "./views";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
const num = (v: PropValue | undefined, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
type Attrs = Record<string, string | undefined>;
interface Props {
  node: Node;
  ctx: RenderContext;
  className: string;
  attrs: Attrs;
}

/** A view of the site's app, if it's there. */
function viewOf(app: App | undefined, id: string) {
  const view = app?.views?.find((v) => v.id === id);
  return app && view && tableOf(app, view.table) ? view : undefined;
}
/** Sample values the editor shows before there are records to show. */
function sampleRows(app: App, view: AppView, n: number) {
  const names = [
    "Priya Sharma",
    "Arjun Mehta",
    "Kavya Nair",
    "Rohan Das",
    "Meera Iyer",
    "Vikram Rao",
  ];
  return Array.from({ length: n }, (_, i) => {
    const row: Record<string, string> = {};
    for (const c of viewColumns(app, view))
      row[c.id] =
        c.type === "status"
          ? ["Approved", "Waiting", "Done"][i % 3]
          : c.money || c.type === "number" || c.type === "total"
            ? c.money
              ? `₹${(12400 - i * 1850).toLocaleString("en-IN")}`
              : String(48 - i * 7)
            : c.type === "date"
              ? `${12 + i} Oct 2026`
              : view.initials?.includes(c.id)
                ? names[i % names.length].replace(/ (\w)\w+$/, " $1.")
                : i === 0 || c.type === "text"
                  ? names[i % names.length]
                  : `Sample ${c.name.toLowerCase()}`;
    return row;
  });
}
/**
 * The editor's rows for a view: the owner's records through the view's rules,
 * or samples while there's no workspace site or no records yet.
 */
function useViewRows(
  ctx: RenderContext,
  view: AppView | undefined,
  size: number,
): { rows: Record<string, string>[]; more: boolean; status: string } {
  const live = !ctx.exporting;
  const data = useTableData(view?.table, live && !!view);
  if (!view || !ctx.project.app)
    return { rows: [], more: false, status: "none" };
  if (data.status === "ready") {
    const page: PublicView = runView(
      ctx.project.app,
      view,
      data.records,
      data.links,
      0,
      size,
    );
    if (page.rows.length) return { ...page, status: "ready" };
  }
  if (data.status === "loading")
    return { rows: [], more: false, status: "loading" };
  return {
    rows: sampleRows(ctx.project.app, view, Math.min(size, view.limit, 6)),
    more: false,
    status: data.status === "ready" ? "empty" : "sample",
  };
}

function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <>
      {Array.from({ length: lines }, (_, i) => (
        <span
          key={i}
          className={`blk-skel${i === 0 ? " is-title" : i === lines - 1 ? " is-short" : ""}`}
        />
      ))}
    </>
  );
}
/** Visually hidden, announced politely when the data script finishes. */
const LiveRegion = () => (
  <p className="blk-sr" aria-live="polite" data-live="" />
);
const ErrorLine = ({ what }: { what: string }) => (
  <p className="blk-data-error" role="alert" hidden>
    <Icon name="rw:info" size={16} />
    <span>{`Couldn’t load ${what}.`}</span>
    <button type="button" className="blk-data-retry">
      Try again
    </button>
  </p>
);
/** An editor-only line under a data block saying where its rows come from. */
function EditorNote({
  ctx,
  children,
}: {
  ctx: RenderContext;
  children: ReactNode;
}) {
  if (!ctx.edit) return null;
  return (
    <span className="blk-data-note">
      <Icon name="layers" size={12} />
      {children}
    </span>
  );
}
function sampleNote(status: string) {
  return status === "sample"
    ? "Sample rows. Your real records show here on a workspace site and once published."
    : status === "empty"
      ? "No records match this view yet, so these are samples. Visitors see the empty message."
      : status === "loading"
        ? "Loading your records…"
        : "";
}

/**
 * A store repeat's products: on a published page those the publisher read
 * (none without a catalogue on the website, so visitors see the empty box);
 * in the editor the site's own (live.ts), or samples with a note saying what
 * visitors see.
 */
function useStoreProducts(
  ctx: RenderContext,
  on: boolean,
  n: Node,
): { items: DataItem[]; note: string } | undefined {
  const catalog = useStoreCatalog(on && !ctx.exporting);
  if (!on) return undefined;
  const category = str(n.props.category);
  const limit = num(n.props.limit, 0);
  const items = (list: typeof SAMPLE_PRODUCTS) =>
    queryStore(list, category, limit).map(storeItem);
  // Template and site previews outside the editor show what a site without
  // a store shows.
  if (ctx.exporting || (!ctx.edit && catalog.status === "none"))
    return { items: items(ctx.store ?? []), note: "" };
  const live = catalog.status === "ready" && catalog.open && catalog.website;
  const mine = live ? items(catalog.products) : [];
  if (mine.length)
    return {
      items: mine,
      note: "Live from your store: names, prices and photos as the published site shows them.",
    };
  if (catalog.status === "loading")
    return { items: [], note: "Loading your products…" };
  return {
    items: queryStore(SAMPLE_PRODUCTS, "", limit).map(storeItem),
    note:
      catalog.status !== "ready"
        ? "Sample products. On a workspace site with Forma Store, your products show here."
        : !catalog.open
          ? "Sample products. Open your store in Store management and its products show here."
          : !catalog.website
            ? "Sample products. Your store doesn’t fill the website’s product blocks, so visitors see “When there are no products”. Turn it on in Store management."
            : `No active products${category ? ` in “${category}”` : ""} yet, so these are samples. Visitors see “When there are no products”.`,
  };
}

// ---------------------------------------------------------------- repeat

export function RepeatBlock({ node: n, ctx, className, attrs }: Props) {
  const p = n.props;
  const ref = parseSource(p.source);
  const layout = ["list", "carousel"].includes(str(p.layout))
    ? str(p.layout)
    : "grid";
  const kids = n.children ?? [];
  const template = kids.find((c) => c.props.slot !== "empty");
  const empty = kids.find((c) => c.props.slot === "empty");
  const size = Math.max(1, Math.min(24, num(p.limit, 0) || PAGE_SIZE));
  const collection =
    ref.kind === "collection"
      ? ctx.project.collections?.find((c) => c.id === ref.id)
      : undefined;
  const view =
    ref.kind === "view" ? viewOf(ctx.project.app, ref.id) : undefined;
  const viewRows = useViewRows(ctx, view, size);
  const store = useStoreProducts(ctx, ref.kind === "store", n);
  // A classic look (converted collection lists: "listing", see looks.css).
  const look = /^[a-z-]{1,20}$/.test(str(p.look)) ? ` rl-${str(p.look)}` : "";
  const cls = `${className} l-${layout}${look}`;
  if (!collection && !view && !store)
    return ctx.edit ? (
      <Placeholder
        icon="layers"
        title="Repeat"
        action={
          ref.kind === "view"
            ? "That list is gone from your app. Choose another on the Data tab."
            : "Choose what to list on the Data tab: a collection, or records from your app."
        }
        attrs={attrs}
        className={className}
      />
    ) : null;
  if (!template)
    return ctx.edit ? (
      <Placeholder
        icon="plus"
        title="Repeat has no card"
        action="Add a box inside it; it’s repeated for every item."
        attrs={attrs}
        className={className}
      />
    ) : null;
  const label =
    n.name ||
    str(p.label) ||
    collection?.name ||
    view?.name ||
    (store ? "Products" : "Items");
  const editingInside = !!ctx.edit?.selected && contains(n, ctx.edit.selected);
  const emptyView = (shown: boolean, extra: Attrs = {}) =>
    empty ? (
      <div className="blk-repeat-empty" {...extra} hidden={!shown || undefined}>
        <NodeView node={empty} ctx={ctx} />
      </div>
    ) : null;
  const carousel = layout === "carousel";
  const listAttrs = {
    className: "blk-repeat-items",
    "aria-label": label,
    ...(carousel && !ctx.edit ? { tabIndex: 0 } : {}),
  };
  /** One item: the first is the editable template, the rest are copies. */
  const itemView = (item: DataItem, i: number, key: string) => (
    <li
      key={key}
      className="blk-repeat-item"
      inert={i > 0 && !!ctx.edit ? true : undefined}
    >
      <NodeView
        node={template}
        ctx={{ ...ctx, item, edit: i === 0 ? ctx.edit : undefined }}
      />
    </li>
  );

  // App records on a published page: skeleton + template, filled by the data script.
  if (view && ctx.exporting) {
    if (!ctx.appApi) return null;
    return (
      <div
        className={cls}
        data-app-api={ctx.appApi}
        data-view={view.id}
        data-size={String(size)}
        data-more={p.more === true ? "1" : undefined}
      >
        <ul {...listAttrs} aria-busy="true">
          {Array.from({ length: Math.min(size, 3) }, (_, i) => (
            <li
              key={i}
              className="blk-repeat-item is-skeleton"
              aria-hidden="true"
            >
              <Skeleton />
            </li>
          ))}
        </ul>
        <template className="blk-repeat-template">
          <li className="blk-repeat-item">
            <NodeView
              node={template}
              ctx={{
                ...ctx,
                item: { index: 0, values: {}, raw: {}, marker: true },
              }}
            />
          </li>
        </template>
        {emptyView(false)}
        <ErrorLine what={label.toLowerCase()} />
        <button type="button" className="blk-repeat-more" hidden>
          {str(p.moreLabel) || "Load more"}
        </button>
        <LiveRegion />
      </div>
    );
  }

  const items: DataItem[] = collection
    ? queryCollection(collection, {
        filterField: str(p.filterField),
        filterOp: str(p.filterOp),
        filterValue: str(p.filterValue),
        sortField: str(p.sortField),
        sortDir: str(p.sortDir),
        limit: num(p.limit, 0),
      }).map((item, i) => collectionItem(collection, item, i, ctx.exporting))
    : store
      ? store.items
      : viewRows.rows.map(rowItem);
  const status = view ? viewRows.status : "ready";
  return (
    <div {...attrs} className={cls}>
      {items.length > 0 && (
        <ul {...listAttrs}>
          {items.map((item, i) => itemView(item, i, String(i)))}
        </ul>
      )}
      {items.length === 0 && !ctx.edit && (empty ? emptyView(true) : null)}
      {items.length === 0 && ctx.edit && collection && !empty && (
        <p className="blk-data-note">{`${collection.name} has no visible items yet. Add some in Data.`}</p>
      )}
      {ctx.edit && empty && (items.length === 0 || editingInside) && (
        <div
          className="blk-repeat-empty is-editing"
          data-label={
            store
              ? "Shown when there are no store products on the website"
              : "Shown when the list is empty"
          }
        >
          <NodeView node={empty} ctx={ctx} />
        </div>
      )}
      {view && p.more === true && viewRows.more && (
        <button type="button" className="blk-repeat-more" tabIndex={-1}>
          {str(p.moreLabel) || "Load more"}
        </button>
      )}
      {store?.note && <EditorNote ctx={ctx}>{store.note}</EditorNote>}
      {view && (
        <EditorNote ctx={ctx}>
          {sampleNote(status) ||
            `Live from “${view.name}”: only its allowed fields reach your website.`}
        </EditorNote>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stat

export function StatBlock({ node: n, ctx, className, attrs }: Props) {
  const p = n.props;
  const ref = parseSource(p.source);
  const app = ctx.project.app;
  const card =
    ref.kind === "card"
      ? app?.dashboard.cards.find((c) => c.id === ref.id)
      : undefined;
  const collection =
    ref.kind === "collection"
      ? ctx.project.collections?.find((c) => c.id === ref.id)
      : undefined;
  const data = useTableData(card?.table, !ctx.exporting && !!card);
  const label = str(p.label) || card?.name || collection?.name || "";
  if (!card && !collection)
    return ctx.edit ? (
      <Placeholder
        icon="activity"
        title="Number"
        action="Choose what to count on the Data tab: an app figure or a collection."
        attrs={attrs}
        className={className}
        compact
      />
    ) : null;
  if (card && !card.public && !ctx.edit) return null;
  const body = (value: ReactNode, extra: Attrs = {}) => (
    <div {...attrs} {...extra} className={className}>
      <span className="blk-stat-value" data-value="">
        {str(p.prefix)}
        {value}
        {str(p.suffix)}
      </span>
      {label && <span className="blk-stat-label">{label}</span>}
      {str(p.caption) && (
        <span className="blk-stat-caption">{str(p.caption)}</span>
      )}
      {card && ctx.edit && !card.public && (
        <span className="blk-data-note is-warning">
          <Icon name="eyeOff" size={12} />
          Hidden on your website until you allow it on the Data tab.
        </span>
      )}
    </div>
  );
  if (collection)
    return body(
      collection.items.filter((i) => !i.hidden).length.toLocaleString("en-IN"),
    );
  // A public dashboard figure: filled from /metrics on a published page.
  if (ctx.exporting)
    return ctx.appApi
      ? body(<span className="blk-skel is-number" aria-hidden="true" />, {
          "data-app-api": ctx.appApi,
          "data-metric": card!.id,
        })
      : null;
  const value = cardValue(card!, data.records);
  const money =
    card!.money ||
    (card!.op === "sum" &&
      tableOf(app!, card!.table)?.fields.find((f) => f.id === card!.field)
        ?.type === "money");
  const shown =
    data.status === "ready"
      ? money
        ? new Intl.NumberFormat(app!.currency === "INR" ? "en-IN" : "en", {
            style: "currency",
            currency: app!.currency,
            maximumFractionDigits: value % 1 ? 2 : 0,
          }).format(value)
        : value.toLocaleString("en-IN")
      : data.status === "loading"
        ? "…"
        : "—";
  return body(shown);
}

// ---------------------------------------------------------------- chart

/** Bars (or a line) per month; the same markup the data script builds. */
export function ChartView({
  bars,
  kind,
  name,
}: {
  bars: { label: string; long: string; value: number; shown: string }[];
  kind: string;
  name: string;
}) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  const summary = `${name}: ${bars.map((b) => `${b.long} ${b.shown}`).join(", ")}`;
  const h = (v: number) => (max ? Math.round((v / max) * 100) : 0);
  if (kind === "line") {
    const w = 100 / Math.max(1, bars.length - 1);
    const points = bars
      .map((b, i) => `${(i * w).toFixed(2)},${(100 - h(b.value)).toFixed(2)}`)
      .join(" ");
    return (
      <div className="blk-chart-plot is-line" role="img" aria-label={summary}>
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polyline
            points={points}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div className="blk-chart-labels" aria-hidden="true">
          {bars.map((b, i) => (
            <span key={i}>{b.label}</span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="blk-chart-plot" role="img" aria-label={summary}>
      {bars.map((b, i) => (
        <div key={i} className="blk-chart-col" aria-hidden="true">
          <span className="blk-chart-value">{b.value ? b.shown : ""}</span>
          <span
            className="blk-chart-bar"
            style={{ "--h": `${h(b.value)}%` } as CSSProperties}
          />
          <span className="blk-chart-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
export function ChartBlock({ node: n, ctx, className, attrs }: Props) {
  const p = n.props;
  const ref = parseSource(p.source);
  const app = ctx.project.app;
  const chart =
    ref.kind === "chart"
      ? app?.dashboard.charts?.find((c) => c.id === ref.id)
      : undefined;
  const data = useTableData(chart?.table, !ctx.exporting && !!chart);
  const kind = str(p.kind) === "line" ? "line" : "bar";
  if (!chart || !app)
    return ctx.edit ? (
      <Placeholder
        icon="activity"
        title="Chart"
        action={
          app?.dashboard.charts?.length
            ? "Choose one of your app’s charts on the Data tab."
            : "Add a chart to your app’s dashboard first (App in the left panel)."
        }
        attrs={attrs}
        className={className}
      />
    ) : null;
  if (!chart.public && !ctx.edit) return null;
  const title = str(p.title) || chart.name;
  const months = Math.max(1, Math.min(24, chart.months || 6));
  if (ctx.exporting)
    return ctx.appApi ? (
      <figure
        className={`${className} k-${kind}`}
        data-app-api={ctx.appApi}
        data-chart={chart.id}
        data-kind={kind}
      >
        {title && <figcaption className="blk-chart-title">{title}</figcaption>}
        <div className="blk-chart-plot is-loading" aria-busy="true">
          {Array.from({ length: months }, (_, i) => (
            <div key={i} className="blk-chart-col" aria-hidden="true">
              <span className="blk-chart-bar blk-skel" />
            </div>
          ))}
        </div>
        <ErrorLine what="this chart" />
        <LiveRegion />
      </figure>
    ) : null;
  const points = chartPoints(app, chart, data.records);
  return (
    <figure {...attrs} className={`${className} k-${kind}`}>
      {title && <figcaption className="blk-chart-title">{title}</figcaption>}
      <ChartView bars={points.bars} kind={kind} name={title} />
      {ctx.edit && !chart.public && (
        <span className="blk-data-note is-warning">
          <Icon name="eyeOff" size={12} />
          Hidden on your website until you allow it on the Data tab.
        </span>
      )}
      {ctx.edit && data.status !== "ready" && chart.public && (
        <EditorNote ctx={ctx}>
          {data.status === "loading"
            ? "Loading your records…"
            : "Your real figures show here on a workspace site."}
        </EditorNote>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------- table

export function TableBlock({ node: n, ctx, className, attrs }: Props) {
  const p = n.props;
  const ref = parseSource(p.source);
  const app = ctx.project.app;
  const view = ref.kind === "view" ? viewOf(app, ref.id) : undefined;
  const size = Math.max(1, Math.min(24, num(p.limit, 0) || 10));
  const rows = useViewRows(ctx, view, size);
  if (!view || !app)
    return ctx.edit ? (
      <Placeholder
        icon="grid"
        title="Table"
        action="Choose records from your app on the Data tab (a list you allow on your website)."
        attrs={attrs}
        className={className}
      />
    ) : null;
  const columns = viewColumns(app, view);
  const caption = str(p.caption) || view.name;
  const head = (
    <thead>
      <tr>
        {columns.map((c) => (
          <th
            key={c.id}
            scope="col"
            data-col={c.id}
            data-status={c.type === "status" ? "" : undefined}
            className={
              c.money || c.type === "number" || c.type === "total"
                ? "is-number"
                : undefined
            }
          >
            {c.name}
          </th>
        ))}
      </tr>
    </thead>
  );
  const cell = (row: Record<string, string>, c: (typeof columns)[number]) => (
    <td
      key={c.id}
      data-label={c.name}
      className={
        c.money || c.type === "number" || c.type === "total"
          ? "is-number"
          : undefined
      }
    >
      {c.type === "status" && row[c.id] ? (
        <span className="blk-table-status">{row[c.id]}</span>
      ) : (
        row[c.id]
      )}
    </td>
  );
  const captionEl = (
    <caption
      className={p.showCaption === false ? "blk-sr" : "blk-table-caption"}
    >
      {caption}
    </caption>
  );
  if (ctx.exporting) {
    if (!ctx.appApi) return null;
    return (
      <div
        className={className}
        data-app-api={ctx.appApi}
        data-view={view.id}
        data-size={String(size)}
        data-more={p.more === true ? "1" : undefined}
      >
        <div className="blk-table-scroll">
          <table>
            {captionEl}
            {head}
            <tbody aria-busy="true">
              {Array.from({ length: 3 }, (_, i) => (
                <tr key={i} className="is-skeleton" aria-hidden="true">
                  {columns.map((c) => (
                    <td key={c.id}>
                      <span className="blk-skel" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="blk-table-empty" hidden>
          {str(p.emptyText) || "Nothing to show yet."}
        </p>
        <ErrorLine what={caption.toLowerCase()} />
        <button type="button" className="blk-repeat-more" hidden>
          {str(p.moreLabel) || "Load more"}
        </button>
        <LiveRegion />
      </div>
    );
  }
  return (
    <div {...attrs} className={className}>
      <div className="blk-table-scroll">
        <table>
          {captionEl}
          {head}
          <tbody>
            {rows.rows.map((row, i) => (
              <tr key={i}>{columns.map((c) => cell(row, c))}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.rows.length && rows.status !== "loading" && (
        <p className="blk-table-empty">
          {str(p.emptyText) || "Nothing to show yet."}
        </p>
      )}
      {p.more === true && rows.more && (
        <button type="button" className="blk-repeat-more" tabIndex={-1}>
          {str(p.moreLabel) || "Load more"}
        </button>
      )}
      <EditorNote ctx={ctx}>
        {sampleNote(rows.status) ||
          `Live from “${view.name}”: only its allowed fields reach your website.`}
      </EditorNote>
    </div>
  );
}
