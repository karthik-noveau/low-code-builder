/**
 * One table of the app: status filters with counts, search, sort, and the
 * records as a table (cards on phones) or, for tables with steps, a board of
 * columns. Rows and cards open the record panel; board cards take the next
 * step in one tap.
 */
import { useMemo, useState } from "react";
import { Icon } from "../studio/Icon";
import {
  recordTitle,
  type App,
  type AppAction,
  type AppRecord,
  type AppTable,
  type AppValue,
} from "./model";
import type { LinkTitles, RecordList } from "./api-types";
import { Empty, LoadError, PaymentBadge, StatusPill } from "./AppUi";
import {
  boardStatuses,
  defaultFilter,
  downloadCsv,
  errorText,
  isStale,
  keyFields,
  linkTitler,
  recordLines,
  recordRows,
  recordTitleOrRef,
  showTotal,
  showValue,
  when,
  type Catalog,
} from "./app-helpers";
import { AppBoard } from "./AppBoard";
import { AppCapacity } from "./AppCapacity";
import { ActionDialog } from "./ActionDialog";

/** The status filter that shows records still waiting for their money. */
const UNPAID = ":unpaid";
type View = "list" | "board";
const viewKey = (tableId: string) => `forma.app.view.${tableId}`;
function savedView(tableId: string): View | undefined {
  try {
    const v = localStorage.getItem(viewKey(tableId));
    return v === "board" || v === "list" ? v : undefined;
  } catch {
    return undefined;
  }
}
function saveView(tableId: string, view: View) {
  try {
    localStorage.setItem(viewKey(tableId), view);
  } catch {
    // Private windows may refuse; the view just isn't remembered.
  }
}

const SEARCHED = new Set(["text", "longText", "phone", "email", "choice"]);

export function AppRecords({
  app,
  table,
  list,
  links,
  error,
  fileName,
  catalog,
  fresh = new Set(),
  onRetry,
  onOpen,
  onAdd,
  onSeen,
  onAction,
  onConflict,
}: {
  app: App;
  table: AppTable;
  list?: RecordList;
  links: LinkTitles;
  error: string;
  /** For the CSV download, e.g. "dhanlaxmi-purchases.csv". */
  fileName: string;
  /** Collections, for places held per event or item; undefined until loaded. */
  catalog?: Catalog;
  /** Records that arrived with the last automatic refresh. */
  fresh?: Set<string>;
  onRetry: () => void;
  onOpen: (recordId: string) => void;
  onAdd: () => void;
  /** The owner has seen the new records. */
  onSeen?: () => void;
  onAction?: (
    record: AppRecord,
    action: AppAction,
    values: Record<string, AppValue>,
    note: string,
  ) => Promise<void>;
  /** A record changed elsewhere first: reload the table. */
  onConflict?: () => void;
}) {
  const records = useMemo(() => list?.records ?? [], [list]);
  const [picked, setPicked] = useState<string>();
  const filter = picked ?? defaultFilter(table, records);
  const canBoard = boardStatuses(table).length > 0 && !!onAction;
  const [chosenView, setChosenView] = useState<View>(
    () => savedView(table.id) ?? "list",
  );
  const view: View = canBoard ? chosenView : "list";
  const [acting, setActing] = useState<{
    record: AppRecord;
    action: AppAction;
  }>();
  const [running, setRunning] = useState("");
  const [boardError, setBoardError] = useState("");
  const paid = records.some((r) => r.payment);
  const unpaid = records.filter(
    (r) => r.payment && r.payment.status !== "paid",
  ).length;
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const linkTitle = linkTitler(links);
  const numberFields = table.fields.filter(
    (f) => f.type === "money" || f.type === "number",
  );
  const columns = keyFields(table, 3);
  const totals = table.totals.slice(0, 2);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const matches = (r: AppRecord) => {
      if (!q) return true;
      const text = [
        recordTitle(table, r),
        r.ref,
        ...table.fields
          .filter((f) => SEARCHED.has(f.type))
          .map((f) => String(r.values[f.id] ?? "")),
        ...table.fields
          .filter((f) => f.type === "link")
          .map((f) => linkTitle(f.table ?? "", String(r.values[f.id] ?? ""))),
        ...recordLines(table, r).map((l) => l.title),
        r.payment?.reference ?? "",
      ]
        .join(" ")
        .toLowerCase();
      // Phones are stored as digits, so "98765 43210" still finds them.
      return (
        text.includes(q) ||
        (digits.length >= 3 && text.replace(/\D/g, "").includes(digits))
      );
    };
    // A reference typed in full finds its record whatever the filter.
    const exact = records.filter((r) => r.ref && r.ref.toLowerCase() === q);
    if (exact.length) return exact;
    const inFilter = (r: AppRecord) =>
      view === "board" ||
      filter === "all" ||
      (filter === UNPAID
        ? !!r.payment && r.payment.status !== "paid"
        : r.status === filter);
    const out = records.filter((r) => inFilter(r) && matches(r));
    const num = (r: AppRecord) =>
      sort.startsWith("total:")
        ? (r.totals?.[sort.slice(6)] ?? 0)
        : Number(r.values[sort.slice(6)] ?? 0) || 0;
    return out.sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : sort === "title"
            ? recordTitle(table, a).localeCompare(recordTitle(table, b))
            : num(b) - num(a),
    );
    // linkTitle is derived from links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, filter, search, sort, table, links, view]);

  const act = async (record: AppRecord, action: AppAction) => {
    setBoardError("");
    if (action.set.length || action.note !== "none") {
      setActing({ record, action });
      return;
    }
    // Nothing to fill in: one tap does it.
    setRunning(record.id);
    try {
      await onAction?.(record, action, {}, "");
    } catch (e) {
      if (isStale(e)) {
        setBoardError(
          `Someone else changed ${recordTitleOrRef(table, record)} first, so “${action.name}” wasn't done. We've loaded the latest version.`,
        );
        onConflict?.();
      } else
        setBoardError(
          `${recordTitleOrRef(table, record)}: ${errorText(e, `“${action.name}” didn't work. Try again.`)}`,
        );
    } finally {
      setRunning("");
    }
  };

  if (error && !list) return <LoadError message={error} onRetry={onRetry} />;
  if (!list)
    return (
      <p role="status" className="app-loading">
        Loading {table.name.toLowerCase()}…
      </p>
    );
  if (!records.length)
    return (
      <Empty title={`No ${table.name.toLowerCase()} yet`} icon="folder">
        <p>
          {table.private
            ? `Add ${table.name.toLowerCase()} here. Visitors can't add them from the website.`
            : `${table.name} appear here when visitors send your forms, or when you add one yourself.`}
        </p>
        <button type="button" className="commerce-button" onClick={onAdd}>
          <Icon name="plus" size={15} /> Add {table.singular.toLowerCase()}
        </button>
      </Empty>
    );
  const count = (status: string) =>
    records.filter((r) => r.status === status).length;
  const filterName =
    view === "board" || filter === "all"
      ? ""
      : filter === UNPAID
        ? "Unpaid"
        : (table.statuses.find((s) => s.id === filter)?.name ?? "");
  const newCount = records.filter((r) => fresh.has(r.id)).length;
  return (
    <section className="commerce-panel app-records" aria-label={table.name}>
      <div className="app-records-toolbar">
        <div className="commerce-index-search">
          <Icon name="search" size={15} />
          <input
            type="search"
            aria-label={`Search ${table.name.toLowerCase()}`}
            placeholder={`Search ${table.name.toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="app-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="title">
              {table.fields.find((f) => f.id === table.titleField)?.name ??
                "Name"}{" "}
              (A–Z)
            </option>
            {numberFields.map((f) => (
              <option key={f.id} value={`field:${f.id}`}>
                {f.name} (largest first)
              </option>
            ))}
            {table.totals.map((t) => (
              <option key={t.id} value={`total:${t.id}`}>
                {t.name} (largest first)
              </option>
            ))}
          </select>
        </label>
        {canBoard && (
          <div className="app-view-toggle" role="group" aria-label="View">
            {(["list", "board"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => {
                  setChosenView(v);
                  saveView(table.id, v);
                }}
              >
                <Icon name={v === "list" ? "menu" : "columns"} size={15} />
                {v === "list" ? "List" : "Board"}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="commerce-button secondary"
          onClick={() =>
            downloadCsv(recordRows(app, table, shown, linkTitle), fileName)
          }
        >
          <Icon name="download" size={15} /> Download CSV
        </button>
        <button type="button" className="commerce-button" onClick={onAdd}>
          <Icon name="plus" size={15} /> Add {table.singular.toLowerCase()}
        </button>
      </div>
      <div className="app-live" aria-live="polite">
        {newCount > 0 && (
          <button
            type="button"
            className="app-new-badge"
            onClick={() => onSeen?.()}
          >
            New: {newCount}
            <span className="app-sr">
              {" "}
              — {newCount === 1 ? "it's" : "they're"} highlighted. Mark as seen
            </span>
          </button>
        )}
      </div>
      {table.capacity?.length ? (
        <AppCapacity
          app={app}
          table={table}
          records={records}
          catalog={catalog}
        />
      ) : null}
      {view === "list" && (table.statuses.length > 0 || paid) && (
        <div
          className="commerce-chips"
          role="group"
          aria-label="Filter by status"
        >
          <button
            type="button"
            aria-pressed={filter === "all"}
            onClick={() => setPicked("all")}
          >
            All <span className="app-chip-count">{records.length}</span>
          </button>
          {table.statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={filter === s.id}
              className={`is-${s.tone}`}
              onClick={() => setPicked(s.id)}
            >
              {s.name} <span className="app-chip-count">{count(s.id)}</span>
            </button>
          ))}
          {paid && (
            <button
              type="button"
              aria-pressed={filter === UNPAID}
              className="is-waiting"
              onClick={() => setPicked(UNPAID)}
            >
              Unpaid <span className="app-chip-count">{unpaid}</span>
            </button>
          )}
        </div>
      )}
      {error && <LoadError message={error} onRetry={onRetry} />}
      {boardError && (
        <div className="commerce-notice error" role="alert">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setBoardError("")}
          >
            ×
          </button>
          {boardError}
        </div>
      )}
      {view === "board" ? (
        <AppBoard
          app={app}
          table={table}
          records={shown}
          links={links}
          fresh={fresh}
          busy={running}
          onOpen={onOpen}
          onAct={(record, action) => void act(record, action)}
        />
      ) : !shown.length ? (
        <p className="commerce-muted app-no-match">
          {search
            ? `Nothing matches “${search}”${filterName ? ` in ${filterName}` : ""}.`
            : `Nothing in ${filterName || table.name} right now.`}
        </p>
      ) : (
        <div className="commerce-scroll">
          <table className="commerce-table app-table">
            <thead>
              <tr>
                <th>
                  {table.fields.find((f) => f.id === table.titleField)?.name ??
                    "Name"}
                </th>
                {columns.map((f) => (
                  <th key={f.id}>{f.name}</th>
                ))}
                {totals.map((t) => (
                  <th key={t.id} className="app-num">
                    {t.name}
                  </th>
                ))}
                {table.statuses.length > 0 && <th>Status</th>}
                {paid && <th>Payment</th>}
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  className={fresh.has(r.id) ? "is-new" : undefined}
                  onClick={() => onOpen(r.id)}
                >
                  <td className="app-title-cell">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(r.id);
                      }}
                    >
                      {recordTitle(table, r)}
                    </button>
                    {(r.ref || fresh.has(r.id)) && (
                      <small>
                        {r.ref}
                        {fresh.has(r.id) && (
                          <span className="app-new-tag">New</span>
                        )}
                      </small>
                    )}
                  </td>
                  {columns.map((f) => (
                    <td
                      key={f.id}
                      data-label={f.name}
                      className={
                        f.type === "money" || f.type === "number"
                          ? "app-num"
                          : undefined
                      }
                    >
                      {showValue(app, f, r, linkTitle) || (
                        <span className="commerce-muted">—</span>
                      )}
                    </td>
                  ))}
                  {totals.map((t) => (
                    <td key={t.id} data-label={t.name} className="app-num">
                      {showTotal(app, t, r.totals?.[t.id])}
                    </td>
                  ))}
                  {table.statuses.length > 0 && (
                    <td data-label="Status">
                      <StatusPill table={table} status={r.status} />
                    </td>
                  )}
                  {paid && (
                    <td data-label="Payment">
                      {r.payment ? (
                        <PaymentBadge payment={r.payment} />
                      ) : (
                        <span className="commerce-muted">—</span>
                      )}
                    </td>
                  )}
                  <td data-label="Added" className="app-date">
                    {when(r.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="commerce-hint app-records-count" aria-live="polite">
        Showing {shown.length} of {records.length}{" "}
        {records.length === 1
          ? table.singular.toLowerCase()
          : table.name.toLowerCase()}
      </p>
      {acting && onAction && (
        <ActionDialog
          app={app}
          table={table}
          action={acting.action}
          record={acting.record}
          links={links}
          onClose={() => setActing(undefined)}
          onConflict={(message) => {
            setActing(undefined);
            setBoardError(message);
            onConflict?.();
          }}
          onRun={async (values, note) => {
            await onAction(acting.record, acting.action, values, note);
            setActing(undefined);
          }}
        />
      )}
    </section>
  );
}
